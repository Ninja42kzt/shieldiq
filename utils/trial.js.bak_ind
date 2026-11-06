// utils/trial.js — trial expiry + reminder emails (via Resend).
// Reminders: 3 days before trial ends, when it ends (user is moved to Free),
// and 3 days after it ended. Each is sent once per user (trial_reminders table).
const { db } = require('../db');

const TRIAL_PLANS = ['business_trial', 'enterprise_trial'];
const PLAN_LABEL = { business_trial: 'Business', enterprise_trial: 'Enterprise' };
const FROM = process.env.EMAIL_FROM || 'ShieldIQ <noreply@glitchfactory.co.ke>';
const SITE = process.env.SITE_URL || 'https://shieldiq.glitchfactory.co.ke';
const DAY = 24 * 60 * 60 * 1000;

let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await db.execute(`CREATE TABLE IF NOT EXISTS trial_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        plan TEXT,
        sent_at TEXT NOT NULL,
        UNIQUE(user_id, kind)
    )`);
    tableReady = true;
}

// Handles both ISO strings and SQLite "YYYY-MM-DD HH:MM:SS" (UTC) values.
function parseDate(v) {
    if (!v) return null;
    let s = String(v);
    if (!s.includes('T')) s = s.replace(' ', 'T') + 'Z';
    const d = new Date(s);
    return isNaN(d) ? null : d;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(name, bodyHtml, ctaText) {
    return `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0A0A0F;color:#fff;border-radius:16px">
        <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
        <h2>Hi ${esc(name)},</h2>
        ${bodyHtml}
        <p style="margin:28px 0"><a href="${SITE}/billing" style="background:#00D4FF;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">${ctaText}</a></p>
        <p style="color:#666;font-size:12px">You're receiving this because you started a ShieldIQ trial.</p>
    </div>`;
}

function buildEmail(kind, user, plan, expires) {
    const label = PLAN_LABEL[plan] || 'paid';
    const dateStr = expires ? expires.toUTCString().slice(0, 16) : '';
    if (kind === 'before_3d') {
        return {
            subject: `Your ShieldIQ ${label} trial ends soon`,
            html: layout(user.name,
                `<p style="color:#ccc">Your <strong>${label}</strong> trial ends on <strong>${esc(dateStr)}</strong>. Upgrade before then to keep AI recommendations, the admin dashboard and team features without interruption.</p>`,
                'Choose a plan'),
        };
    }
    if (kind === 'ended') {
        return {
            subject: 'Your ShieldIQ trial has ended',
            html: layout(user.name,
                `<p style="color:#ccc">Your <strong>${label}</strong> trial has ended and your account is now on the <strong>Free</strong> plan. Your progress and results are saved.</p><p style="color:#ccc">Upgrade any time to get your ${label} features back.</p>`,
                'Upgrade now'),
        };
    }
    return {
        subject: 'Still want ShieldIQ Business features?',
        html: layout(user.name,
            `<p style="color:#ccc">Your trial ended a few days ago. Your training progress is safe, and you can pick up where you left off by upgrading.</p>`,
            'See plans'),
    };
}

let defaultSender = null;
async function resendSender({ to, subject, html }) {
    if (!defaultSender) {
        const { Resend } = require('resend');
        defaultSender = new Resend(process.env.RESEND_API_KEY);
    }
    const { error } = await defaultSender.emails.send({ from: FROM, to, subject, html });
    if (error) throw new Error(error.message || 'Resend error');
}

// Claim the reminder first (UNIQUE makes it idempotent), send, release the claim if sending fails.
async function sendOnce(user, kind, plan, expires, sender, now) {
    const claim = await db.execute({
        sql: 'INSERT OR IGNORE INTO trial_reminders (user_id, kind, plan, sent_at) VALUES (?, ?, ?, ?)',
        args: [user.id, kind, plan, now.toISOString()],
    });
    if (!claim.rowsAffected) return false;
    try {
        const { subject, html } = buildEmail(kind, user, plan, expires);
        await sender({ to: user.email, subject, html });
        return true;
    } catch (e) {
        await db.execute({ sql: 'DELETE FROM trial_reminders WHERE user_id = ? AND kind = ?', args: [user.id, kind] });
        console.error(`Trial email "${kind}" failed for user ${user.id}:`, e.message);
        return false;
    }
}

async function processTrials({ now = new Date(), sender = resendSender } = {}) {
    await ensureTable();
    const out = { before_3d: 0, ended: 0, after_3d: 0 };

    const trials = await db.execute({
        sql: `SELECT id, name, email, plan, trial_expires_at FROM users
              WHERE plan IN (${TRIAL_PLANS.map(() => '?').join(',')}) AND trial_expires_at IS NOT NULL`,
        args: TRIAL_PLANS,
    });
    for (const u of trials.rows) {
        const expires = parseDate(u.trial_expires_at);
        if (!expires) continue;
        if (expires <= now) {
            await db.execute({ sql: "UPDATE users SET plan = 'free' WHERE id = ? AND plan = ?", args: [u.id, u.plan] });
            if (await sendOnce(u, 'ended', u.plan, expires, sender, now)) out.ended++;
        } else if (expires - now <= 3 * DAY) {
            if (await sendOnce(u, 'before_3d', u.plan, expires, sender, now)) out.before_3d++;
        }
    }

    const cutoff = new Date(now - 3 * DAY).toISOString();
    const lapsed = await db.execute({
        sql: `SELECT u.id, u.name, u.email, r.plan AS trial_plan FROM users u
              JOIN trial_reminders r ON r.user_id = u.id AND r.kind = 'ended'
              WHERE u.plan = 'free' AND r.sent_at <= ?
                AND NOT EXISTS (SELECT 1 FROM trial_reminders x WHERE x.user_id = u.id AND x.kind = 'after_3d')`,
        args: [cutoff],
    });
    for (const u of lapsed.rows) {
        if (await sendOnce(u, 'after_3d', u.trial_plan, null, sender, now)) out.after_3d++;
    }
    return out;
}

// Called at login so an expired trial never shows paid features, even between cron runs.
async function expireIfNeeded(email) {
    const r = await db.execute({
        sql: 'SELECT id, plan, trial_expires_at FROM users WHERE email = ?',
        args: [email],
    });
    const u = r.rows[0];
    if (!u || !TRIAL_PLANS.includes(u.plan)) return;
    const expires = parseDate(u.trial_expires_at);
    if (expires && expires <= new Date()) {
        await db.execute({ sql: "UPDATE users SET plan = 'free' WHERE id = ? AND plan = ?", args: [u.id, u.plan] });
    }
}

module.exports = { processTrials, expireIfNeeded, ensureTable };
