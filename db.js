const { createClient } = require('@libsql/client');

// Uses local file in dev, Turso in production
const db = createClient(
    process.env.TURSO_URL
        ? { url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN }
        : { url: 'file:shieldiq.db' }
);

async function initDB() {
    await db.executeMultiple(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            company TEXT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'employee',
            department TEXT DEFAULT 'general',
            verified INTEGER DEFAULT 0,
            mfa_enabled INTEGER DEFAULT 0,
            plan TEXT DEFAULT 'free',
            trial_expires_at DATETIME,
            company_domain TEXT,
            invited_by_admin INTEGER DEFAULT 0,
            trial_activated INTEGER DEFAULT 0,
            token_version INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS quiz_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            category TEXT,
            score INTEGER,
            weak_areas TEXT,
            taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            admin_id INTEGER,
            plan TEXT DEFAULT 'free',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS code_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company TEXT NOT NULL,
            requested_by INTEGER NOT NULL,
            repo_url TEXT NOT NULL,
            branch TEXT DEFAULT 'main',
            status TEXT DEFAULT 'running',
            risk_score INTEGER,
            summary TEXT,
            vulnerabilities TEXT,
            recommendations TEXT,
            error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY(requested_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            purpose TEXT DEFAULT 'verify',
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            email TEXT,
            attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS trusted_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            device_token TEXT UNIQUE NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // CREATE TABLE IF NOT EXISTS won't add new columns to a table that
    // already existed before this change (e.g. an existing shieldiq.db
    // on a dev machine or persistent Turso db). Add them defensively.
    const migrations = [
        "ALTER TABLE users ADD COLUMN department TEXT DEFAULT 'general'",
        "ALTER TABLE code_scans ADD COLUMN recommendations TEXT",
        // These three are used by register-company, the admin "add employee" invite
        // flow, and the invited-employee first-login trial activation (see routes/auth.js
        // and routes/admin.js) but were previously missing from both the CREATE TABLE
        // above and this list -- on a brand new database those routes would fail with
        // "no such column". Added defensively so a fresh install isn't broken.
        "ALTER TABLE users ADD COLUMN company_domain TEXT",
        "ALTER TABLE users ADD COLUMN invited_by_admin INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN trial_activated INTEGER DEFAULT 0",
        // Bumped on password change / reset so any JWT issued before that moment stops
        // working immediately, instead of staying valid until it naturally expires.
        "ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0",
    ];
    for (const sql of migrations) {
        try {
            await db.execute(sql);
        } catch (err) {
            // Ignore "duplicate column" errors — means it's already there.
            if (!/duplicate column/i.test(err.message)) {
                console.error('Migration failed:', sql, err.message);
            }
        }
    }

    console.log('Database initialized');
}

module.exports = { db, initDB };
