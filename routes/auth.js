const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require("../db");
const crypto = require('crypto');
const { generateOTP, sendVerificationEmail, sendOTPEmail } = require('../utils/email');
const { verifySession } = require('../utils/session');

// Register
const VALID_DEPARTMENTS = ['general', 'it', 'hr', 'finance', 'operations', 'sales'];

// Builds the { token, user } payload returned on a completed login, and —
// when the client asked to trust this device — a device_token the client
// should store and send back on future /login calls to skip MFA for the
// configured window (see DEVICE_TRUST_DAYS below).
const DEVICE_TRUST_DAYS = 30;

// Session length: short enough to limit how long a leaked token stays useful, long enough that
// people aren't re-logging-in constantly. Configurable via env without a code change.
const SESSION_TTL = process.env.JWT_EXPIRES_IN || '12h';

function issueSession(user) {
    const token = jwt.sign(
        // tokenVersion is checked against users.token_version on every authenticated request
        // (see server.js / admin.js / billing.js / itScan.js). Bumping that column -- done on
        // password change/reset -- instantly invalidates every token issued before the bump,
        // instead of leaving a stolen token valid until it naturally expires.
        { id: user.id, email: user.email, role: user.role, tokenVersion: user.token_version || 0 },
        process.env.JWT_SECRET,
        { expiresIn: SESSION_TTL }
    );
    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            company: user.company,
            email: user.email,
            role: user.role,
            department: user.department || 'general',
            plan: user.plan,
            mfa_enabled: user.mfa_enabled,
        },
    };
}

async function trustThisDevice(email) {
    const deviceToken = crypto.randomUUID();
    const expires = new Date(Date.now() + DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.execute({
        sql: 'INSERT INTO trusted_devices (email, device_token, expires_at) VALUES (?, ?, ?)',
        args: [email, deviceToken, expires],
    });
    return deviceToken;
}

async function isDeviceTrusted(email, deviceToken) {
    if (!deviceToken) return false;
    const result = await db.execute({
        sql: 'SELECT 1 FROM trusted_devices WHERE email = ? AND device_token = ? AND expires_at > CURRENT_TIMESTAMP',
        args: [email, deviceToken],
    });
    return result.rows.length > 0;
}

let trialIpTableReady = false;
async function ensureTrialIpTable() {
    if (trialIpTableReady) return;
    await db.execute(`CREATE TABLE IF NOT EXISTS trial_signup_ips (
        ip TEXT PRIMARY KEY,
        user_id INTEGER,
        plan TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    trialIpTableReady = true;
}

// POST /api/auth/register -- DISABLED (security fix, see chat notes).
//
// This endpoint used to trust a client-supplied `role` field verbatim:
//     const userRole = role === 'admin' ? 'admin' : 'employee';
// Anyone could POST { role: 'admin', company: '<any existing company name>', ... } directly
// to this endpoint (no login page even needed) and receive a working admin JWT -- full access
// to /admin, the employee list, and billing for whatever company name they typed, bypassing
// requireAdmin entirely. It also let a caller self-grant a business/enterprise trial via a
// client-supplied `plan` field, with no PayPal subscription ever created, and bound an
// arbitrary free-text `company` string with no domain or invite check, letting an outsider
// attach themselves to a real company's data (headcount, stats, leaderboard).
//
// The only page that ever called this was public/register.html, which is not linked from any
// current nav (every "Register"/"Get Started" link points at /register, which 301-redirects to
// /register-individual) -- it's dead UI, not a feature in current use. That page has been
// removed. Account creation now only happens via:
//   - /register-company      (new company admin; role is hardcoded 'admin' server-side, and a
//                              non-public email domain can only be claimed by one company)
//   - /register-individual   (solo learner; role hardcoded 'admin' for their own billing, but
//                              with no company/team, so admin.js's /employees route refuses them)
//   - POST /api/admin/employees (existing admin invites a teammate; role is hardcoded
//                              'employee' there and can't be changed by the request body)
// If self-serve "join my company as an employee" signup (without an admin invite) is wanted
// back, it needs rebuilding with the company bound to the verified email domain -- never to a
// client-supplied role or free-text company name.
router.post('/register', (req, res) => {
    res.status(410).json({ message: 'This signup method is no longer available. Use /register-company, /register-individual, or ask your admin to add you.' });
});

// Verify email
router.post('/verify-email', async (req, res) => {
    const { email, otp } = req.body;

    try {
        const result = await db.execute({
            sql: 'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
            args: [email, otp, 'verify'],
        });
        const record = result.rows[0];

        if (!record) return res.status(400).json({ message: 'Invalid or expired code' });

        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ message: 'Code expired. Please register again.' });
        }

        await db.execute({ sql: 'UPDATE otps SET used = 1 WHERE id = ?', args: [record.id] });
        await db.execute({ sql: 'UPDATE users SET verified = 1 WHERE email = ?', args: [email] });

        res.json({ message: 'Email verified! You can now login.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login — step 1
router.post('/login', async (req, res) => {
    const { email, password, deviceToken } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE email = ?',
            args: [email],
        });
        const user = result.rows[0];

        if (!user) return res.status(401).json({ message: 'Invalid email or password' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ message: 'Invalid email or password' });

        if (!user.verified) return res.status(401).json({ message: 'Please verify your email first' });

        // MFA only applies if the user has actually turned it on, and is
        // skipped on a device they've chosen to trust (see /verify-login).
        if (!user.mfa_enabled || await isDeviceTrusted(email, deviceToken)) {
            await require('../utils/trial').expireIfNeeded(email);
            const refreshed = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];
            return res.json(issueSession(refreshed));
        }

        const mfaOtp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({
            sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
            args: [email, mfaOtp, 'login', expires],
        });
        console.log(`[DEV] Login OTP for ${email}: ${mfaOtp}`);
        try {
            await sendOTPEmail(email, user.name, mfaOtp, 'login');
        } catch (emailErr) {
            console.error('Email send failed (non-blocking):', emailErr.message);
        }

        res.json({ requiresMFA: true, message: 'Check your email for your login code', email });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login — step 2: verify MFA
router.post('/verify-login', async (req, res) => {
    const { email, otp, trustDevice } = req.body;

    try {
        const otpResult = await db.execute({
            sql: 'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
            args: [email, otp, 'login'],
        });
        const record = otpResult.rows[0];

        if (!record || new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired code' });
        }

        await db.execute({ sql: 'UPDATE otps SET used = 1 WHERE id = ?', args: [record.id] });
        await require('../utils/trial').expireIfNeeded(email);

        const userResult = await db.execute({
            sql: 'SELECT * FROM users WHERE email = ?',
            args: [email],
        });
        const user = userResult.rows[0];

        const session = issueSession(user);
        // "Trust this device" — skip the emailed code next time, on this
        // device, for DEVICE_TRUST_DAYS. Still requires password every time.
        if (trustDevice) {
            session.deviceToken = await trustThisDevice(email);
        }

        res.json(session);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Change password
router.post('/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE id = ?',
            args: [decoded.id],
        });
        const user = result.rows[0];

        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await db.execute({
            sql: 'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
            args: [hashed, decoded.id],
        });

        // Bumping token_version invalidates every token issued before this moment, including
        // the one that was just used to call this endpoint -- so hand back a fresh one for
        // *this* device/session rather than silently logging the user out of their own request.
        const refreshed = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [decoded.id] })).rows[0];
        const session = issueSession(refreshed);
        res.json({ message: 'Password changed successfully. You have been logged out of any other sessions.', token: session.token, user: session.user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot password — send OTP
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE email = ?',
            args: [email],
        });
        const user = result.rows[0];

        if (!user) return res.json({ message: 'If that email exists, a reset code has been sent.', email });

        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({
            sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
            args: [email, otp, 'reset', expires],
        });
        console.log(`[DEV] Reset OTP for ${email}: ${otp}`);
        try {
            await sendOTPEmail(email, user.name, otp, 'reset');
        } catch (emailErr) {
            console.error('Email send failed (non-blocking):', emailErr.message);
        }

        res.json({ message: 'If that email exists, a reset code has been sent.', email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot password — reset
router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
            args: [email, otp, 'reset'],
        });
        const record = result.rows[0];

        if (!record || new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired code' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        await db.execute({ sql: 'UPDATE otps SET used = 1 WHERE id = ?', args: [record.id] });
        const hashed = await bcrypt.hash(newPassword, 10);
        // Also bumps token_version: if an attacker had a stolen session token for this account,
        // a password reset (which is often done *because* the account was compromised) now
        // invalidates it immediately instead of leaving it valid until it naturally expires.
        await db.execute({
            sql: 'UPDATE users SET password = ?, token_version = token_version + 1 WHERE email = ?',
            args: [hashed, email],
        });

        // First-time activation for an admin-added employee: decide their plan now, based on
        // the company's CURRENT state, not whatever it was when the admin added them.
        const target = (await db.execute({ sql: 'SELECT id, company, invited_by_admin, trial_activated FROM users WHERE email = ?', args: [email] })).rows[0];
        if (target && target.invited_by_admin && !target.trial_activated) {
            const adminRow = (await db.execute({
                sql: "SELECT plan FROM users WHERE company = ? AND role = 'admin' LIMIT 1",
                args: [target.company],
            })).rows[0];
            const companyPlan = adminRow?.plan || 'free';
            if (companyPlan === 'business_trial' || companyPlan === 'enterprise_trial') {
                const trialExpiry = new Date();
                trialExpiry.setDate(trialExpiry.getDate() + 7);
                await db.execute({
                    sql: 'UPDATE users SET plan = ?, trial_expires_at = ?, trial_activated = 1 WHERE id = ?',
                    args: [companyPlan, trialExpiry.toISOString(), target.id],
                });
            } else {
                await db.execute({
                    sql: 'UPDATE users SET plan = ?, trial_expires_at = NULL, trial_activated = 1 WHERE id = ?',
                    args: [companyPlan, target.id],
                });
            }
        }

        res.json({ message: 'Password reset successfully! You can now login.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Enable 2FA — send OTP
router.post('/enable-2fa', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const { user } = await verifySession(token);

        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({
            sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
            args: [user.email, otp, '2fa-enable', expires],
        });
        await sendOTPEmail(user.email, user.name, otp, 'login');

        res.json({ message: 'Confirmation code sent to your email. Enter it to activate 2FA.' });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Confirm 2FA
router.post('/confirm-2fa', async (req, res) => {
    const { otp } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const { decoded, user } = await verifySession(token);

        const otpResult = await db.execute({
            sql: 'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
            args: [user.email, otp, '2fa-enable'],
        });
        const record = otpResult.rows[0];

        if (!record || new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired code' });
        }

        await db.execute({ sql: 'UPDATE otps SET used = 1 WHERE id = ?', args: [record.id] });
        await db.execute({ sql: 'UPDATE users SET mfa_enabled = 1 WHERE id = ?', args: [decoded.id] });

        res.json({ message: '2FA enabled successfully! Your account is now more secure.' });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Disable 2FA
router.post('/disable-2fa', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const { decoded } = await verifySession(token);
        await db.execute({ sql: 'UPDATE users SET mfa_enabled = 0 WHERE id = ?', args: [decoded.id] });
        res.json({ message: '2FA disabled.' });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Companies with these email domains are never treated as "one account per org" --
// many legitimate businesses here register with a personal Gmail/Yahoo address.
const PUBLIC_EMAIL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'mail.com', 'yandex.com', 'zoho.com',
];

// Register Company (Admin)
router.post('/register-company', async (req, res) => {
    const { companyName, adminName, email, password } = req.body;

    if (!companyName || !adminName || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email address' });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    const domainIsEnforced = emailDomain && !PUBLIC_EMAIL_DOMAINS.includes(emailDomain);

    try {
        const existing = await db.execute({
            sql: 'SELECT id FROM users WHERE email = ?',
            args: [email],
        });
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        if (domainIsEnforced) {
            const existingCompany = await db.execute({
                sql: "SELECT id FROM users WHERE role = 'admin' AND company_domain = ?",
                args: [emailDomain],
            });
            if (existingCompany.rows.length > 0) {
                return res.status(400).json({ message: 'An account for this company already exists. Ask your admin to add you as an employee instead.' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.execute({
            sql: `INSERT INTO users (name, company, email, password, verified, role, plan, trial_expires_at, company_domain)
                  VALUES (?, ?, ?, ?, 0, 'admin', 'free', NULL, ?)`,
            args: [adminName, companyName, email, hashedPassword, domainIsEnforced ? emailDomain : null],
        });

        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({
            sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
            args: [email, otp, 'verify', expires],
        });

        // Bug found while testing the fixes above: this call wasn't wrapped, so a transient email
        // provider hiccup (rate limit, timeout, outage) made the ENTIRE company signup fail with a
        // 500 -- even though the user row above had already been committed. The admin would see
        // "Server error" with no OTP ever sent, then get "Email already registered" on any retry,
        // stuck with no way to verify or recreate the account. /register-individual already
        // correctly treats this as non-blocking (see below); this matches that pattern.
        try {
            await sendVerificationEmail(email, adminName, otp);
        } catch (emailErr) {
            console.error('Email send failed (non-blocking):', emailErr.message);
        }

        res.status(201).json({
            message: 'Company account created! Check your email for your verification code.',
            requiresVerification: true,
            email,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Register Individual (solo learner, no company). Always role='admin' purely so they
// can reuse the billing/upgrade flow for themselves -- they have no team, so admin.js's
// /employees route explicitly refuses them, and the dashboard redirect logic sends them
// to /dashboard rather than /admin since that check also requires a company.
router.post('/register-individual', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email address' });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    try {
        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.execute({
            sql: `INSERT INTO users (name, company, email, password, verified, role, plan, trial_expires_at)
                  VALUES (?, NULL, ?, ?, 0, 'admin', 'free', NULL)`,
            args: [name, email, hashedPassword],
        });

        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({
            sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)',
            args: [email, otp, 'verify', expires],
        });

        try {
            await sendVerificationEmail(email, name, otp);
        } catch (emailErr) {
            console.error('Email send failed (non-blocking):', emailErr.message);
        }

        res.status(201).json({
            message: 'Account created! Check your email for your verification code.',
            requiresVerification: true,
            email,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
