const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { plans } = require('../config/plans');
const paypal = require('../services/paypal');

const router = express.Router();
const TRIAL_PLANS = ['business_trial', 'enterprise_trial'];
const SITE = process.env.SITE_URL || 'https://shieldiq.glitchfactory.co.ke';
function safeReturn(path) {
    return (typeof path === 'string' && path.startsWith('/')) ? `${SITE}${path}` : undefined;
}

async function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const d = jwt.verify(token, process.env.JWT_SECRET);
        const u = (await db.execute({ sql: 'SELECT id, name, email, plan, trial_expires_at FROM users WHERE id = ?', args: [d.id] })).rows[0];
        if (!u) return res.status(401).json({ message: 'Invalid token' });
        req.user = u;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// Start a PayPal subscription. The plan is only upgraded later, by the verified webhook.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/paypal/subscribe', auth, async (req, res) => {
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
        let startTime = null;
        if (TRIAL_PLANS.includes(req.user.plan) && req.user.trial_expires_at) {
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
        res.json({ approveUrl: sub.approveUrl, chargesFrom: startTime ? startTime.toISOString() : 'now' });
    } catch (e) {
        console.error('subscribe failed:', e.message);
        res.status(500).json({ message: 'Could not start subscription' });
    }
});

router.get('/status', auth, async (req, res) => {
    const subs = await db.execute({
        sql: 'SELECT provider, plan_key, status, seats, updated_at FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 5',
        args: [req.user.id],
    });
    res.json({ plan: req.user.plan, subscriptions: subs.rows });
});

async function setUserPlan(userId, plan) {
    const row = (await db.execute({ sql: 'SELECT company FROM users WHERE id = ?', args: [userId] })).rows[0];
    if (row && row.company) {
        // Cascades to every teammate under this company — including anyone mid-way through
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
        console.warn('PayPal payment failed for subscription', r.id, '\u2014 downgrading to free');
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
