require('dotenv').config();
const { db } = require('../db');

async function clearDB() {
    console.log('Clearing code_scans...');
    await db.execute('DELETE FROM code_scans');

    console.log('Clearing otps...');
    await db.execute('DELETE FROM otps');

    console.log('Clearing login_attempts...');
    await db.execute('DELETE FROM login_attempts');

    console.log('Clearing users...');
    await db.execute('DELETE FROM users');

    console.log('Database cleared.');
    process.exit(0);
}

clearDB().catch(err => {
    console.error('Clear failed:', err);
    process.exit(1);
});
