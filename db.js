const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'shieldiq.db'));

const db = new Database(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'employee',
        plan TEXT DEFAULT 'free',
        company_id INTEGER,
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

    CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        purpose TEXT DEFAULT 'verify',
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

const migrations = [
    `ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`,
    `ALTER TABLE users ADD COLUMN company_id INTEGER`,
    `ALTER TABLE companies ADD COLUMN plan TEXT DEFAULT 'free'`,
];

migrations.forEach(sql => { 
    try { 
        db.exec(sql); 
    } catch(e) {} 
});

console.log('Database initialized at:', dbPath);

module.exports = db;