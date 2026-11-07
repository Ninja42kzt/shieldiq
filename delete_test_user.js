// Deletes ONE user and everything that references them, so you can re-register and test a plan from scratch.
// Usage:
//   node delete_test_user.js <email>                preview only, nothing is deleted
//   node delete_test_user.js <email> --yes          actually delete (also cancels any live PayPal subscription)
//   node delete_test_user.js <email> --yes --force  also delete if PayPal itself fails to cancel the subscription
try { require('dotenv').config(); } catch (e) {}
const { db } = require('./db');
const paypal = require('./services/paypal');

const email = process.argv[2];
const confirmed = process.argv.includes('--yes');
const force = process.argv.includes('--force');

(async () => {
    if (!email || email.startsWith('--')) {
        console.log('Usage: node delete_test_user.js <email> [--yes] [--force]');
        process.exit(1);
    }

    const u = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];
    if (!u) { console.log('No user found with email', email); process.exit(1); }

    const hidden = /pass|hash|secret|token|otp|mfa/i;
    const safe = {};
    for (const k of Object.keys(u)) if (isNaN(Number(k)) && !hidden.test(k)) safe[k] = u[k];
    console.log('User:', JSON.stringify(safe));

    // Live PayPal subscriptions get cancelled on PayPal itself before we touch the DB,
    // so PayPal doesn't keep billing/sending webhooks for a ghost user. This only
    // happens on the --yes run -- a preview never calls out to PayPal.
    let subs = [];
    try { subs = (await db.execute({ sql: 'SELECT provider_sub_id, plan_key, status FROM subscriptions WHERE user_id = ?', args: [u.id] })).rows; } catch (e) {}
    const live = subs.filter(s => ['ACTIVE', 'APPROVED', 'APPROVAL_PENDING', 'PENDING'].includes(String(s.status).toUpperCase()));
    if (live.length) {
        console.log('\nFound active/pending subscription(s):', JSON.stringify(live));
        if (!confirmed) {
            console.log('These will be cancelled on PayPal automatically when you re-run with --yes.');
        } else {
            for (const s of live) {
                try {
                    await paypal.cancelSubscription(s.provider_sub_id, 'Test account deleted via delete_test_user.js');
                    console.log(`  Cancelled ${s.provider_sub_id} on PayPal.`);
                } catch (e) {
                    console.log(`  Could not cancel ${s.provider_sub_id} on PayPal: ${e.message}`);
                    if (!force) {
                        console.log('Re-run with --force to delete anyway (this one will be left active on PayPal\'s side).');
                        process.exit(1);
                    }
                }
            }
        }
    }

    // Find every table that references this user -- both via a declared
    // FOREIGN KEY to users(id) (catches things like code_scans.requested_by,
    // whatever its column is called) and via the "user_id" naming
    // convention (catches tables that reference users without an actual
    // FK constraint), deduplicated so a column caught by both isn't queried
    // twice.
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map(r => r.name);
    const targets = [];
    const seen = new Set();
    for (const t of tables) {
        if (t === 'users') continue;
        const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows.map(c => c.name);
        const fks = (await db.execute(`PRAGMA foreign_key_list("${t}")`)).rows;
        const refCols = new Set(fks.filter(fk => fk.table === 'users').map(fk => fk.from));
        if (cols.includes('user_id')) refCols.add('user_id');
        // companies.admin_id references users(id) too, but without an actual
        // FOREIGN KEY constraint in the schema, so PRAGMA foreign_key_list
        // won't surface it -- keep this one explicit.
        if (t === 'companies' && cols.includes('admin_id')) refCols.add('admin_id');

        for (const col of refCols) {
            const key = t + '.' + col;
            if (seen.has(key)) continue;
            seen.add(key);
            const n = (await db.execute({ sql: `SELECT COUNT(*) AS n FROM "${t}" WHERE "${col}" = ?`, args: [u.id] })).rows[0].n;
            targets.push({ table: t, column: col, n: Number(n) });
        }
    }

    console.log('\nRows that will be deleted:');
    targets.forEach(t => console.log('  ' + t.table + '.' + t.column + ': ' + t.n));
    console.log('  users: 1');

    if ('company_id' in u && u.company_id != null) {
        const others = (await db.execute({ sql: 'SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND id != ?', args: [u.company_id, u.id] })).rows[0].n;
        if (Number(others) > 0) console.log('\nNOTE: ' + others + ' other user(s) belong to this user\'s company. They are NOT deleted.');
    }

    if (!confirmed) {
        console.log('\nPreview only. Re-run with --yes to delete.');
        process.exit(0);
    }

    for (const t of targets) {
        await db.execute({ sql: `DELETE FROM "${t.table}" WHERE ${t.column} = ?`, args: [u.id] });
    }
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [u.id] });
    console.log('\nDeleted ' + email + ' and all related rows. You can register it again.');
    process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
