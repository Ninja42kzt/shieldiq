// reset-and-seed.js — wipe ShieldIQ data and seed one account per tier.
// Usage (from the project root):
//   node reset-and-seed.js            -> dry run, shows target + what would happen
//   node reset-and-seed.js --confirm  -> actually wipes and seeds
//
// Schema is kept; only rows are deleted. Download a SQLite backup from the
// Turso dashboard (Overview -> Download SQLite File) BEFORE running with --confirm.

require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_URL || 'file:shieldiq.db';
const db = createClient(
    process.env.TURSO_URL
        ? { url, authToken: process.env.TURSO_TOKEN }
        : { url }
);

const COMPANY = 'Wayne Enterprise';

// email, name, plan, role, department
const SEED = [
    { email: 'nicholasmatata2@gmail.com', name: 'Nicholas Matata', plan: 'enterprise', role: 'admin',    department: 'it' },
    { email: 'hunterwarrior774@gmail.com', name: 'Hunter Warrior', plan: 'business',   role: 'employee', department: 'general' },
    { email: 'noahk20p@gmail.com',         name: 'Noah',           plan: 'free',       role: 'employee', department: 'general' },
];

const WIPE_ORDER = ['otps', 'login_attempts', 'quiz_results', 'code_scans', 'subscriptions', 'companies', 'users'];

async function main() {
    const confirm = process.argv.includes('--confirm');
    const host = url.startsWith('file:') ? url : url.replace(/^libsql:\/\//, '');
    console.log(`Target database: ${host}`);

    if (!confirm) {
        console.log('\nDRY RUN. Would delete all rows from:', WIPE_ORDER.join(', '));
        console.log('Would then create:');
        SEED.forEach(s => console.log(`  - ${s.email}  plan=${s.plan}  role=${s.role}`));
        console.log('\nRe-run with --confirm to do it.');
        return;
    }

    for (const t of WIPE_ORDER) {
        try {
            await db.execute(`DELETE FROM ${t}`);
        } catch (e) {
            if (!/no such table/i.test(e.message)) throw e;
        }
    }
    try {
        await db.execute(
            `DELETE FROM sqlite_sequence WHERE name IN (${WIPE_ORDER.map(() => '?').join(',')})`,
            WIPE_ORDER
        );
    } catch { /* sqlite_sequence may not exist yet; ignore */ }
    console.log('Wiped all rows.');

    const creds = [];
    let adminId = null;
    for (const s of SEED) {
        const password = crypto.randomBytes(9).toString('base64url'); // 12 chars
        const hash = await bcrypt.hash(password, 10);
        const r = await db.execute({
            sql: `INSERT INTO users (name, company, email, password, verified, role, department, plan, trial_expires_at)
                  VALUES (?, ?, ?, ?, 1, ?, ?, ?, NULL)`,
            args: [s.name, COMPANY, s.email, hash, s.role, s.department, s.plan],
        });
        if (s.role === 'admin') adminId = Number(r.lastInsertRowid);
        creds.push({ email: s.email, plan: s.plan, role: s.role, password });
    }

    await db.execute({
        sql: 'INSERT INTO companies (name, admin_id, plan) VALUES (?, ?, ?)',
        args: [COMPANY, adminId, 'enterprise'],
    });

    console.log('\nSeeded accounts (passwords shown once, change them after first login):');
    console.table(creds);
}

main()
    .then(() => process.exit(0))
    .catch(e => { console.error('Failed:', e.message); process.exit(1); });
