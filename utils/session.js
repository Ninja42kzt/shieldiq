const jwt = require('jsonwebtoken');
const { db } = require('../db');

// Verifies a bearer token's signature/expiry AND that it hasn't been superseded by a password
// change or reset since it was issued (see users.token_version, bumped in routes/auth.js'
// /change-password and /reset-password). Without this second check, a stolen token would stay
// valid for its full lifetime even after the legitimate owner changed their password specifically
// because the account was compromised.
//
// Returns { decoded, user } where `user` is the full, CURRENT row from the DB -- callers should
// read role/plan/department/etc. from `user`, never from `decoded`, since those can change after
// a token was issued. Throws on any failure (bad signature, expired, unknown user, superseded
// token); callers should catch and respond 401.
async function verifySession(token) {
    if (!token) {
        const e = new Error('No token provided');
        e.status = 401;
        throw e;
    }
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        const e = new Error('Invalid or expired token');
        e.status = 403;
        throw e;
    }
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [decoded.id] });
    const user = result.rows[0];
    if (!user) {
        const e = new Error('User not found');
        e.status = 401;
        throw e;
    }
    if (Number(user.token_version || 0) !== Number(decoded.tokenVersion || 0)) {
        const e = new Error('Session expired, please log in again');
        e.status = 401;
        throw e;
    }
    return { decoded, user };
}

module.exports = { verifySession };
