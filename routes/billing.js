const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { plans } = require('../config/plans');
const paypal = require('../services/paypal');

const router = express.Router();
const TRIAL_PLANS = ['business_trial', 'enterprise_trial', 'individual_trial', 'individual_pro_trial'];
const SITE = process.env.SITE_URL || 'https://shieldiq.glitchfactory.co.ke';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PUBLIC_EMAIL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'mail.com', 'yandex.com', 'zoho.com',
];

function safeReturn(path) {
    return (typeof path === 'string' && path.startsWith('/')) ? `${SITE}${path}` : undefined;
}

// One free trial per account, ever. Cancelling a trial must NOT make another one available.
// "Used" = a trial expiry was ever recorded, OR any subscription row exists (starting a trial
// creates one and cancelling only changes its status), OR the account is in trial_signup_ips.
async function hasUsedTrial(userId) {
    await ensureTrialIpTable();
    const u = await db.execute({ sql: 'SELECT trial_expires_at FROM users WHERE id = ?', args: [userId] });
    if (u.rows[0] && u.rows[0].trial_expires_at) return true;
    const s = await db.execute({ sql: 'SELECT 1 FROM subscriptions WHERE user_id = ? LIMIT 1', args: [userId] });
    if (s.rows.length) return true;
    const ip = await db.execute({ sql: 'SELECT 1 FROM trial_signup_ips WHERE user_id = ? LIMIT 1', args: [userId] });
    return ip.rows.length > 0;
}

let trialIpTableReady = false;
async function ensureTrialIpTable() {
    if (trialIpTableReady) return;
    await db.execute(`CREATE TABLE IF NOT EXISTS trial_signup_ips (
        ip TEXT PRIMARY KEY,
        user_id INTEGER,
        plan TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    trialIpTableReady = true;
}

async function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const d = jwt.verify(token, process.env.JWT_SECRET);
        const u = (await db.execute({ sql: 'SELECT id, name, email, role, plan, trial_expires_at FROM users WHERE id = ?', args: [d.id] })).rows[0];
        if (!u) return res.status(401).json({ message: 'Invalid token' });
        req.user = u;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// Only company admins manage billing -- an employee JWT reaching these routes gets rejected.
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only the company admin can manage billing' });
    }
    next();
}

// Start a trial on an already-registered, already-free company: sets plan + trial_expires_at,
// enforces one trial per IP (bypassed for TRIAL_IP_ALLOWLIST), then kicks off the same deferred
// PayPal approval as the paid flow below -- nothing is charged until the trial actually ends.
router.post('/start-trial-paypal', auth, requireAdmin, async (req, res) => {
    const planKey = req.body?.plan;
    const cfg = plans[planKey];
    if (!cfg) return res.status(400).json({ message: 'Invalid plan' });
    if (req.user.plan !== 'free') return res.status(400).json({ message: 'This company already has a plan or trial in progress' });
    try {
        if (await hasUsedTrial(req.user.id)) {
            return res.status(400).json({ code: 'TRIAL_USED', message: 'Your free trial has already been used. Please subscribe to continue.' });
        }
    } catch (e) {
        console.error('trial check failed:', e.message);
        return res.status(500).json({ message: 'Could not start trial' });
    }

    const clientIp = req.ip;
    const trialIpAllowlist = (process.env.TRIAL_IP_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
    const ipIsAllowlisted = trialIpAllowlist.includes(clientIp);

    try {
        await ensureTrialIpTable();
        if (!ipIsAllowlisted) {
            const prior = await db.execute({ sql: 'SELECT 1 FROM trial_signup_ips WHERE ip = ?', args: [clientIp] });
            if (prior.rows.length > 0) {
                return res.status(400).json({ message: 'A free trial has already been started from this network.' });
            }
        }

        const trialPlanKey = `${planKey}_trial`;
        const trialExpiry = new Date();
        trialExpiry.setDate(trialExpiry.getDate() + (planKey.startsWith('individual') ? 3 : 7));
        await db.execute({
            sql: 'UPDATE users SET plan = ?, trial_expires_at = ? WHERE id = ?',
            args: [trialPlanKey, trialExpiry.toISOString(), req.user.id],
        });
        if (!ipIsAllowlisted) {
            await db.execute({
                sql: 'INSERT OR IGNORE INTO trial_signup_ips (ip, user_id, plan) VALUES (?, ?, ?)',
                args: [clientIp, req.user.id, trialPlanKey],
            });
        }

        const seats = Math.min(Math.max(parseInt(req.body?.seats, 10) || 1, 1), cfg.maxSeats);
        const returnUrl = safeReturn(req.body?.returnPath);
        const cancelUrl = safeReturn(req.body?.cancelPath);
        const sub = await paypal.createSubscription({
            planKey, seats, user: { ...req.user, plan: trialPlanKey }, startTime: trialExpiry, returnUrl, cancelUrl,
        });
        await db.execute({
            sql: `INSERT OR IGNORE INTO subscriptions (user_id, provider, provider_sub_id, plan_key, status, seats)
                  VALUES (?, 'paypal', ?, ?, 'PENDING', ?)`,
            args: [req.user.id, sub.id, planKey, seats],
        });
        res.json({ approveUrl: sub.approveUrl });
    } catch (e) {
        console.error('start-trial-paypal failed:', e.message);
        res.status(500).json({ message: 'Could not start trial' });
    }
});

// Start a PayPal subscription. The plan is only upgraded later, by the verified webhook.
router.post('/paypal/subscribe', auth, requireAdmin, async (req, res) => {
    const planKey = req.body?.plan;
    const returnUrl = safeReturn(req.body?.returnPath);
    const cancelUrl = safeReturn(req.body?.cancelPath);
    const paypalEmail = (typeof req.body?.paypalEmail === 'string' && EMAIL_RE.test(req.body.paypalEmail))
        ? req.body.paypalEmail.trim()
        : undefined;
    const cfg = plans[planKey];
    if (!cfg) return res.status(400).json({ message: 'Invalid plan' });
    const seats = Math.min(Math.max(parseInt(req.body?.seats, 10) || 1, 1), cfg.maxSeats);
    try {
        await reconcileSubscriptions(req.user.id);
        const activeRows = (await db.execute({ sql: "SELECT plan_key FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE'", args: [req.user.id] })).rows;
        if (activeRows.some(r => r.plan_key === planKey)) return res.status(400).json({ message: 'You are already subscribed to this plan.' });
        // Switching (upgrade or downgrade): a new PayPal subscription is created for the new plan, and the
        // old one is cancelled only after the new one is approved and ACTIVE (see retireOtherSubscriptions).
        const switching = activeRows.length > 0;
        let startTime = null;
        if (!switching && TRIAL_PLANS.includes(req.user.plan) && req.user.trial_expires_at) {
            const s = String(req.user.trial_expires_at);
            const t = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
            if (t - Date.now() > 10 * 60 * 1000) startTime = t; // first charge when the trial ends
        }
        const sub = await paypal.createSubscription({ planKey, seats, user: req.user, startTime, returnUrl, cancelUrl, paypalEmail });
        await db.execute({
            sql: `INSERT OR IGNORE INTO subscriptions (user_id, provider, provider_sub_id, plan_key, status, seats)
                  VALUES (?, 'paypal', ?, ?, 'PENDING', ?)`,
            args: [req.user.id, sub.id, planKey, seats],
        });
        res.json({ approveUrl: sub.approveUrl, chargesFrom: startTime ? startTime.toISOString() : 'now', switching });
    } catch (e) {
        console.error('subscribe failed:', e.message);
        res.status(500).json({ message: 'Could not start subscription' });
    }
});

router.get('/status', auth, async (req, res) => {
    const subs = await db.execute({
        sql: "SELECT provider, plan_key, status, seats, updated_at FROM subscriptions WHERE user_id = ? AND status != 'ABANDONED' ORDER BY id DESC LIMIT 5",
        args: [req.user.id],
    });
    let trialAvailable = false;
    try { trialAvailable = !(await hasUsedTrial(req.user.id)); } catch (e) { console.error('trial status check failed:', e.message); }
    const activeRow = (await db.execute({
        sql: "SELECT plan_key FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1",
        args: [req.user.id],
    })).rows[0];
    // Sandbox buyer accounts can only sign in on sandbox.paypal.com; the live site rejects them.
    const paypalManageUrl = (process.env.PAYPAL_ENV === 'live' ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com') + '/myaccount/autopay/';
    res.json({
        plan: req.user.plan, subscriptions: subs.rows, trialAvailable,
        hasActiveSub: !!activeRow, activePlanKey: activeRow ? activeRow.plan_key : null, paypalManageUrl,
    });
});

// Cancel the caller's active PayPal subscription. This only asks PayPal to cancel; the verified
// CANCELLED webhook (processEvent) does the actual downgrade to free.
router.post('/paypal/cancel', auth, requireAdmin, async (req, res) => {
    try {
        const row = (await db.execute({
            sql: "SELECT provider_sub_id FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1",
            args: [req.user.id],
        })).rows[0];
        if (!row) return res.status(400).json({ message: 'No active subscription to cancel' });
        await paypal.cancelSubscription(row.provider_sub_id, 'Cancelled by customer in ShieldIQ');
        await db.execute({ sql: "UPDATE subscriptions SET status='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE provider_sub_id = ?", args: [row.provider_sub_id] });
        await setUserPlan(req.user.id, 'free');
        res.json({ message: 'Subscription cancelled. Your plan is now Free.' });
    } catch (e) {
        console.error('cancel failed:', e.message);
        res.status(500).json({ message: 'Could not cancel here. Please cancel in PayPal instead.' });
    }
});

// Confirms PENDING subscriptions directly with PayPal, so a late or missing webhook never leaves a
// paying customer on the wrong plan. Only activates a subscription whose custom_id is this user.
async function reconcileSubscriptions(userId) {
    const pend = await db.execute({
        sql: "SELECT provider_sub_id, plan_key, created_at FROM subscriptions WHERE user_id = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 10",
        args: [userId],
    });
    // A PENDING row = checkout started but not (yet) approved at PayPal. Unapproved ones can never bill.
    // Anything still unapproved after 24h is marked ABANDONED so it stops cluttering status and sync.
    const isStale = (c) => {
        const t = new Date(String(c).includes('T') ? String(c) : String(c).replace(' ', 'T') + 'Z');
        return !isNaN(t) && Date.now() - t > 24 * 60 * 60 * 1000;
    };
    const markStatus = (id, status) => db.execute({
        sql: "UPDATE subscriptions SET status = ?, updated_at=CURRENT_TIMESTAMP WHERE provider_sub_id = ? AND status = 'PENDING'",
        args: [status, id],
    });
    for (const row of pend.rows) {
        try {
            const sub = await paypal.getSubscription(row.provider_sub_id);
            if (['CANCELLED', 'EXPIRED', 'SUSPENDED'].includes(sub.status)) { await markStatus(row.provider_sub_id, sub.status); continue; }
            if (sub.status !== 'ACTIVE' && isStale(row.created_at)) { await markStatus(row.provider_sub_id, 'ABANDONED'); continue; }
            if (sub.status === 'ACTIVE' && String(sub.custom_id) === String(userId) && plans[row.plan_key]) {
                await db.execute({
                    sql: "UPDATE subscriptions SET status='ACTIVE', updated_at=CURRENT_TIMESTAMP WHERE provider_sub_id = ?",
                    args: [row.provider_sub_id],
                });
                await setUserPlan(userId, plans[row.plan_key].appPlan);
                await retireOtherSubscriptions(userId, row.provider_sub_id);
                return true;
            }
        } catch (e) {
            console.error('reconcile failed:', e.message);
            if (/\(404\)/.test(e.message) && isStale(row.created_at)) {
                try { await markStatus(row.provider_sub_id, 'ABANDONED'); } catch (e2) { /* ignore */ }
            }
        }
    }
    return false;
}

router.post('/paypal/sync', auth, async (req, res) => {
    try {
        const changed = await reconcileSubscriptions(req.user.id);
        const newest = (await db.execute({
            sql: "SELECT provider_sub_id FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1",
            args: [req.user.id],
        })).rows[0];
        if (newest) await retireOtherSubscriptions(req.user.id, newest.provider_sub_id);
        res.json({ changed });
    } catch (e) {
        console.error('sync failed:', e.message);
        res.status(500).json({ message: 'Could not sync' });
    }
});

// After a new subscription is ACTIVE (plan switch), cancel the user's older ACTIVE ones at PayPal so they
// aren't billed twice. Failures are logged and retried on the next /paypal/sync (billing/settings page load).
async function retireOtherSubscriptions(userId, keepSubId) {
    const rows = (await db.execute({
        sql: "SELECT provider_sub_id FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE' AND provider_sub_id != ?",
        args: [userId, keepSubId],
    })).rows;
    for (const row of rows) {
        try {
            let remote = null;
            try { remote = await paypal.getSubscription(row.provider_sub_id); } catch (e) { /* fall through to cancel */ }
            if (!remote || !['CANCELLED', 'EXPIRED'].includes(remote.status)) {
                await paypal.cancelSubscription(row.provider_sub_id, 'Replaced by a plan change in ShieldIQ');
            }
            await db.execute({ sql: "UPDATE subscriptions SET status='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE provider_sub_id = ?", args: [row.provider_sub_id] });
        } catch (e) {
            console.error('could not cancel replaced subscription', row.provider_sub_id, e.message);
        }
    }
}

async function setUserPlan(userId, plan) {
    const row = (await db.execute({ sql: 'SELECT company FROM users WHERE id = ?', args: [userId] })).rows[0];
    if (row && row.company) {
        // Cascades to every teammate under this company -- including anyone mid-way through
        // their own independent trial countdown. A company-wide plan change always wins.
        await db.execute({ sql: 'UPDATE users SET plan = ?, trial_expires_at = NULL WHERE company = ?', args: [plan, row.company] });
    } else {
        await db.execute({ sql: 'UPDATE users SET plan = ?, trial_expires_at = NULL WHERE id = ?', args: [plan, userId] });
    }
}

// Exported separately so tests can call it directly.
async function processEvent(ev) {
    const r = ev.resource || {};
    const type = ev.event_type;

    if (type === 'BILLING.SUBSCRIPTION.ACTIVATED') {
        const sub = (await db.execute({ sql: 'SELECT * FROM subscriptions WHERE provider_sub_id = ?', args: [r.id] })).rows[0];
        if (!sub) return console.warn('Webhook for unknown subscription', r.id);
        await db.execute({ sql: "UPDATE subscriptions SET status='ACTIVE', updated_at=CURRENT_TIMESTAMP WHERE provider_sub_id = ?", args: [r.id] });
        await setUserPlan(sub.user_id, plans[sub.plan_key].appPlan);
        await retireOtherSubscriptions(sub.user_id, r.id);
    } else if (['BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED'].includes(type)) {
        const sub = (await db.execute({ sql: 'SELECT * FROM subscriptions WHERE provider_sub_id = ?', args: [r.id] })).rows[0];
        if (!sub) return;
        await db.execute({ sql: 'UPDATE subscriptions SET status = ?, updated_at=CURRENT_TIMESTAMP WHERE provider_sub_id = ?', args: [type.split('.').pop(), r.id] });
        const other = await db.execute({
            sql: "SELECT 1 FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE' AND provider_sub_id != ?",
            args: [sub.user_id, r.id],
        });
        if (!other.rows.length) await setUserPlan(sub.user_id, 'free');
    } else if (type === 'PAYMENT.SALE.COMPLETED') {
        const subId = r.billing_agreement_id;
        const sub = subId ? (await db.execute({ sql: 'SELECT user_id FROM subscriptions WHERE provider_sub_id = ?', args: [subId] })).rows[0] : null;
        await db.execute({
            sql: `INSERT OR IGNORE INTO payments (user_id, provider, provider_payment_id, provider_sub_id, amount, currency)
                  VALUES (?, 'paypal', ?, ?, ?, ?)`,
            args: [sub?.user_id ?? null, r.id, subId || null, r.amount?.total || null, r.amount?.currency || null],
        });
    } else if (type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
        const sub = (await db.execute({ sql: 'SELECT * FROM subscriptions WHERE provider_sub_id = ?', args: [r.id] })).rows[0];
        if (!sub) return console.warn('Payment failed for unknown subscription', r.id);
        console.warn('PayPal payment failed for subscription', r.id, '-- downgrading to free');
        await db.execute({ sql: "UPDATE subscriptions SET status='PAYMENT_FAILED', updated_at=CURRENT_TIMESTAMP WHERE provider_sub_id = ?", args: [r.id] });
        const other = await db.execute({
            sql: "SELECT 1 FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE' AND provider_sub_id != ?",
            args: [sub.user_id, r.id],
        });
        if (!other.rows.length) await setUserPlan(sub.user_id, 'free');
    }
}

// Mounted in server.js BEFORE express.json() with express.raw(), so req.body is a Buffer.
async function webhookHandler(req, res) {
    try {
        await paypal.ensureTables();
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
        if (!raw || !(await paypal.verifyWebhook(req.headers, raw))) {
            return res.status(400).json({ message: 'Invalid signature' });
        }
        const ev = JSON.parse(raw);
        const claim = await db.execute({ sql: 'INSERT OR IGNORE INTO webhook_events (id) VALUES (?)', args: [ev.id] });
        if (!claim.rowsAffected) return res.json({ ok: true, duplicate: true });
        try {
            await processEvent(ev);
        } catch (e) {
            await db.execute({ sql: 'DELETE FROM webhook_events WHERE id = ?', args: [ev.id] });
            throw e;
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('PayPal webhook error:', e.message);
        res.status(500).json({ message: 'Error' });
    }
}

module.exports = { router, webhookHandler, processEvent };
