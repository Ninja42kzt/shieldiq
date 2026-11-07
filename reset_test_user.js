// Resets ONE user's billing/trial state so the trial flow can be tested again.
// Usage: node reset_test_user.js <email> [--force]
// Leaves quiz results, training notes and every other account untouched.
try { require('dotenv').config(); } catch (e) {}
const { db } = require('./db');

const email = process.argv[2];
const force = process.argv.includes('--force');

(async () => {
    if (!email || email.startsWith('--')) {
        console.log('Usage: node reset_test_user.js <email> [--force]');
        process.exit(1);
    }
    const u = (await db.execute({ sql: 'SELECT id, email, plan, trial_expires_at FROM users WHERE email = ?', args: [email] })).rows[0];
    if (!u) { console.log('No user found with email', email); process.exit(1); }
    console.log('User:', u.id, u.email, '| plan:', u.plan, '| trial_expires_at:', u.trial_expires_at);

    let subs = [];
    try {
        subs = (await db.execute({ sql: 'SELECT provider_sub_id, plan_key, status FROM subscriptions WHERE user_id = ?', args: [u.id] })).rows;
    } catch (e) {}
    console.log('Subscription rows:', subs.length ? JSON.stringify(subs) : 'none');

    const live = subs.filter(s => ['ACTIVE', 'APPROVED', 'APPROVAL_PENDING', 'PENDING'].includes(String(s.status).toUpperCase()));
    if (live.length && !force) {
        console.log('\nThere is an active/pending subscription. Cancel it in the app first (that also cancels it on PayPal),');
        console.log('or re-run with --force if it is just an abandoned PayPal approval.');
        process.exit(1);
    }

    await db.execute({ sql: "UPDATE users SET plan = 'free', trial_expires_at = NULL WHERE id = ?", args: [u.id] });
    for (const sql of [
        'DELETE FROM subscriptions WHERE user_id = ?',
        'DELETE FROM trial_signup_ips WHERE user_id = ?',
        'DELETE FROM trial_reminders WHERE user_id = ?',
    ]) {
        try { await db.execute({ sql, args: [u.id] }); } catch (e) { console.log('skipped:', sql, '-', e.message); }
    }
    console.log('\nDone. ' + email + ' is on Free with no trial or subscription history.');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
