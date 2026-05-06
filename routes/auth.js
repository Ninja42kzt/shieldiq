const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { generateOTP, sendVerificationEmail, sendOTPEmail } = require('../utils/email');

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { message: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    message: { message: 'Too many code attempts. Please wait 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Employee Register
router.post('/register', registerLimiter, async (req, res) => {
    const { name, company, email, password } = req.body;
    if (!name || !company || !email || !password)
        return res.status(400).json({ message: 'All fields are required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
        return res.status(400).json({ message: 'Invalid email address' });

    try {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) return res.status(400).json({ message: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare(
            'INSERT INTO users (name, company, email, password, verified, role) VALUES (?, ?, ?, ?, 0, ?)'
        ).run(name, company, email, hashedPassword, 'employee');

        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)')
            .run(email, otp, 'verify', expires);

        await sendVerificationEmail(email, name, otp);
        res.status(201).json({ message: 'Account created! Check your email for verification code.', requiresVerification: true, email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Company/Admin Register
router.post('/register-company', registerLimiter, async (req, res) => {
    const { adminName, companyName, email, password } = req.body;
    if (!adminName || !companyName || !email || !password)
        return res.status(400).json({ message: 'All fields are required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
        return res.status(400).json({ message: 'Invalid email address' });

    if (password.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters' });

    try {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) return res.status(400).json({ message: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create admin user first
        const userResult = db.prepare(
            'INSERT INTO users (name, company, email, password, verified, role) VALUES (?, ?, ?, ?, 0, ?)'
        ).run(adminName, companyName, email, hashedPassword, 'admin');

        const adminId = userResult.lastInsertRowid;

        // Create company record linked to admin
        const companyResult = db.prepare(
            'INSERT INTO companies (name, admin_id) VALUES (?, ?)'
        ).run(companyName, adminId);

        // Link user to company
        db.prepare('UPDATE users SET company_id = ? WHERE id = ?').run(companyResult.lastInsertRowid, adminId);

        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)')
            .run(email, otp, 'verify', expires);

        await sendVerificationEmail(email, adminName, otp);
        res.status(201).json({ message: 'Company account created! Check your email for verification code.', requiresVerification: true, email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify email
router.post('/verify-email', otpLimiter, (req, res) => {
    const { email, otp } = req.body;
    try {
        const record = db.prepare(
            'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
        ).get(email, otp, 'verify');

        if (!record) return res.status(400).json({ message: 'Invalid or expired code' });
        if (new Date(record.expires_at) < new Date()) return res.status(400).json({ message: 'Code expired. Please register again.' });

        db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(record.id);
        db.prepare('UPDATE users SET verified = 1 WHERE email = ?').run(email);
        res.json({ message: 'Email verified! You can now login.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Login step 1
router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'All fields are required' });

    try {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) return res.status(401).json({ message: 'Invalid email or password' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ message: 'Invalid email or password' });
        if (!user.verified) return res.status(401).json({ message: 'Please verify your email first' });

        const mfaOtp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)')
            .run(email, mfaOtp, 'login', expires);

        await sendOTPEmail(email, user.name, mfaOtp, 'login');
        res.json({ requiresMFA: true, message: 'Check your email for your login code', email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login step 2
router.post('/verify-login', otpLimiter, async (req, res) => {
    const { email, otp } = req.body;
    try {
        const record = db.prepare(
            'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
        ).get(email, otp, 'login');

        if (!record || new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'Invalid or expired code' });

        db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(record.id);
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, plan: user.plan || 'free' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user.id, name: user.name, company: user.company, email: user.email, role: user.role, plan: user.plan || 'free', mfa_enabled: user.mfa_enabled }
        });
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
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
        if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters' });
        const hashed = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, decoded.id);
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot password step 1
router.post('/forgot-password', otpLimiter, async (req, res) => {
    const { email } = req.body;
    try {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) return res.json({ message: 'If that email exists, a reset code has been sent.' });
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)')
            .run(email, otp, 'reset', expires);
        await sendOTPEmail(email, user.name, otp, 'reset');
        res.json({ message: 'If that email exists, a reset code has been sent.', email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot password step 2
router.post('/reset-password', otpLimiter, async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const record = db.prepare(
            'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
        ).get(email, otp, 'reset');
        if (!record || new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'Invalid or expired code' });
        if (newPassword.length < 8)
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(record.id);
        const hashed = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashed, email);
        res.json({ message: 'Password reset successfully! You can now login.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Enable 2FA step 1
router.post('/enable-2fa', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)')
            .run(user.email, otp, '2fa-enable', expires);
        await sendOTPEmail(user.email, user.name, otp, 'login');
        res.json({ message: 'Confirmation code sent to your email. Enter it to activate 2FA.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Enable 2FA step 2
router.post('/confirm-2fa', async (req, res) => {
    const { otp } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        const record = db.prepare(
            'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
        ).get(user.email, otp, '2fa-enable');
        if (!record || new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'Invalid or expired code' });
        db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(record.id);
        db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(decoded.id);
        res.json({ message: '2FA enabled successfully! Your account is now more secure.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Disable 2FA
router.post('/disable-2fa', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        db.prepare('UPDATE users SET mfa_enabled = 0 WHERE id = ?').run(decoded.id);
        res.json({ message: '2FA disabled.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;