const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const db = require('./db');

function rateLimitAuth(req, res, next) {
    // Only rate limit POST requests (login, register, etc.)
    if (req.method !== 'POST') return next();

    const ip = req.ip || req.connection.remoteAddress;
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 10;
    const since = new Date(Date.now() - windowMs).toISOString();

    const attempts = db.prepare(
        `SELECT COUNT(*) as count FROM login_attempts WHERE ip = ? AND attempted_at > ?`
    ).get(ip, since);

    if (attempts.count >= maxAttempts) {
        return res.status(429).json({ message: 'Too many attempts. Please wait 15 minutes.' });
    }

    db.prepare(`INSERT INTO login_attempts (ip, email) VALUES (?, ?)`).run(ip, req.body?.email || null);
    next();
}

function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(403).json({ message: 'Invalid token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
}

const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', rateLimitAuth, authRoutes);
app.use('/api/quiz', authenticateToken, quizRoutes);
app.use('/api/admin', authenticateToken, requireAdmin, adminRoutes);

const pages = [
    ['/', 'index.html'],
    ['/login', 'login.html'],
    ['/register', 'register.html'],
    ['/verify', 'verify.html'],
    ['/forgot-password', 'forgot-password.html'],
    ['/dashboard', 'dashboard.html'],
    ['/quiz', 'quiz.html'],
    ['/progress', 'progress.html'],
    ['/leaderboard', 'leaderboard.html'],
    ['/settings', 'settings.html'],
    ['/pricing', 'pricing.html'],
    ['/admin', 'admin.html'],
    ['/business-trial', 'business-trial.html'],
    ['/enterprise-trial', 'enterprise-trial.html'],
    ['/about', 'about.html'],
    ['/contact', 'contact.html'],
    ['/terms', 'terms.html'],
    ['/privacy', 'privacy.html'],
    ['/register-company', 'register-company.html'],
];

for (const [route, file] of pages) {
    app.get(route, (req, res) => res.sendFile(path.join(__dirname, 'public', file)));
}

app.listen(PORT, () => {
    console.log(`ShieldIQ running on http://localhost:${PORT}`);
});