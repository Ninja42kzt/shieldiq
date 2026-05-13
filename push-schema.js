require('dotenv').config();
const { createClient } = require('@libsql/client');

const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
});

async function pushSchema() {
    await db.execute(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        role TEXT DEFAULT 'employee',
        plan TEXT DEFAULT 'free',
        trial_expires_at TEXT,
        mfa_enabled INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    console.log('✅ Schema pushed to Turso successfully!');
    process.exit(0);
}

pushSchema().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
