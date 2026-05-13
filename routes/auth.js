const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require("../db");
const { generateOTP, sendVerificationEmail, sendOTPEmail } = require('../utils/email');

// Register
router.post('/register', async (req, res) => {
    const { name, company, email, password, role, plan } = req.body;
    if (!name || !company || !email || !password)
        return res.status(400).json({ message: 'All fields are required' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
        return res.status(400).json({ message: 'Invalid email address' });
    if (password.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    try {
        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
        if (existing.rows.length > 0)
            return res.status(400).json({ message: 'Email already registered' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = role === 'admin' ? 'admin' : 'employee';
        const userPlan = plan || 'free';
        let trialExpiry = null;
        if (plan === 'business_trial' || plan === 'enterprise_trial') {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            trialExpiry = d.toISOString();
        }
        await db.execute({
            sql: `INSERT INTO users (name, company, email, password, verified, role, plan, trial_expires_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
            args: [name, company, email, hashedPassword, userRole, userPlan, trialExpiry],
        });
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({ sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)', args: [email, otp, 'verify', expires] });
        await sendVerificationEmail(email, name, otp);
        res.status(201).json({ message: 'Account created! Check your email for your verification code.', requiresVerification: true, email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
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
        if (new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'Code expired. Please register again.' });
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
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'All fields are required' });
    try {
        const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
        const user = result.rows[0];
        if (!user) return res.status(401).json({ message: 'Invalid email or password' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ message: 'Invalid email or password' });

        // TEMP: bypass verified check and MFA - remove before public launch
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        return res.json({
            token,
            user: { id: user.id, name: user.name, company: user.company, email: user.email, role: user.role, plan: user.plan }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login — step 2: verify MFA
router.post('/verify-login', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const otpResult = await db.execute({
            sql: 'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
            args: [email, otp, 'login'],
        });
        const record = otpResult.rows[0];
        if (!record || new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'Invalid or expired code' });
        await db.execute({ sql: 'UPDATE otps SET used = 1 WHERE id = ?', args: [record.id] });
        const userResult = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
        const user = userResult.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ token, user: { id: user.id, name: user.name, company: user.company, email: user.email, role: user.role, plan: user.plan, mfa_enabled: user.mfa_enabled } });
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
        const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [decoded.id] });
        const user = result.rows[0];
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
        if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
        const hashed = await bcrypt.hash(newPassword, 10);
        await db.execute({ sql: 'UPDATE users SET password = ? WHERE id = ?', args: [hashed, decoded.id] });
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
        const user = result.rows[0];
        if (!user) return res.json({ message: 'If that email exists, a reset code has been sent.', email });
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({ sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)', args: [email, otp, 'reset', expires] });
        await sendOTPEmail(email, user.name, otp, 'reset');
        res.json({ message: 'If that email exists, a reset code has been sent.', email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
            args: [email, otp, 'reset'],
        });
        const record = result.rows[0];
        if (!record || new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'Invalid or expired code' });
        if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
        await db.execute({ sql: 'UPDATE otps SET used = 1 WHERE id = ?', args: [record.id] });
        const hashed = await bcrypt.hash(newPassword, 10);
        await db.execute({ sql: 'UPDATE users SET password = ? WHERE email = ?', args: [hashed, email] });
        res.json({ message: 'Password reset successfully! You can now login.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Enable 2FA
router.post('/enable-2fa', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [decoded.id] });
        const user = result.rows[0];
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({ sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)', args: [user.email, otp, '2fa-enable', expires] });
        await sendOTPEmail(user.email, user.name, otp, 'login');
        res.json({ message: 'Confirmation code sent to your email.' });
    } catch (err) {
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userResult = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [decoded.id] });
        const user = userResult.rows[0];
        const otpResult = await db.execute({
            sql: 'SELECT * FROM otps WHERE email = ? AND otp = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
            args: [user.email, otp, '2fa-enable'],
        });
        const record = otpResult.rows[0];
        if (!record || new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'Invalid or expired code' });
        await db.execute({ sql: 'UPDATE otps SET used = 1 WHERE id = ?', args: [record.id] });
        await db.execute({ sql: 'UPDATE users SET mfa_enabled = 1 WHERE id = ?', args: [decoded.id] });
        res.json({ message: '2FA enabled successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Disable 2FA
router.post('/disable-2fa', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await db.execute({ sql: 'UPDATE users SET mfa_enabled = 0 WHERE id = ?', args: [decoded.id] });
        res.json({ message: '2FA disabled.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Force verify
router.get('/force-verify/:email', async (req, res) => {
    try {
        await db.execute({ sql: 'UPDATE users SET verified = 1 WHERE email = ?', args: [req.params.email] });
        res.json({ message: 'User verified successfully' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Register Company
router.post('/register-company', async (req, res) => {
    const { companyName, adminName, email, password } = req.body;
    if (!companyName || !adminName || !email || !password)
        return res.status(400).json({ message: 'All fields are required' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
        return res.status(400).json({ message: 'Invalid email address' });
    if (password.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    try {
        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
        if (existing.rows.length > 0)
            return res.status(400).json({ message: 'Email already registered' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute({
            sql: `INSERT INTO users (name, company, email, password, verified, role, plan, trial_expires_at) VALUES (?, ?, ?, ?, 0, 'admin', 'free', NULL)`,
            args: [adminName, companyName, email, hashedPassword],
        });
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.execute({ sql: 'INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)', args: [email, otp, 'verify', expires] });
        await sendVerificationEmail(email, adminName, otp);
        res.status(201).json({ message: 'Company account created! Check your email for your verification code.', requiresVerification: true, email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Set plan
router.get('/set-plan/:email/:plan', async (req, res) => {
    try {
        await db.execute({
            sql: "UPDATE users SET plan=?, trial_expires_at=datetime('now', '+30 days') WHERE email=?",
            args: [req.params.plan, req.params.email]
        });
        res.json({ message: 'Plan updated' });
    } catch(e) {
        res.status(500).json({ message: e.message });
    }
});

module.exports = router;