const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { verifySession } = require('./utils/session');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers. The app relies heavily on inline <script>/<style> across its pages
// (no nonces/build step), so script-src/style-src keep 'unsafe-inline' rather than breaking
// every page -- this is a conscious trade-off, not an oversight. It still buys clickjacking
// protection (frameAncestors/X-Frame-Options), MIME-sniffing protection, HSTS, and a locked
// down default-src. Tightening script-src further would need moving inline scripts to files
// and adopting nonces, which is a larger follow-up.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            // Helmet's own defaults set script-src-attr: 'none' even when scriptSrc above allows
            // 'unsafe-inline' -- script-src-attr is a separate, more specific CSP directive that
            // governs inline onclick="..."/onload="..." attributes, and overrides scriptSrc for
            // them. This entire site is built on onclick="..." handlers (every button, every
            // page), so leaving this at Helmet's default silently breaks every button site-wide
            // with no visible error unless you check the console. Found and fixed by actually
            // testing a page after adding Helmet, not just reasoning about the config.
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// CORS: this API is called from ShieldIQ's own pages (auth is a Bearer token, not a cookie,
// so this isn't a CSRF control) but an open wildcard still lets any site script unauthenticated
// endpoints against it, and is flagged by basically every security scanner. Restrict to the
// site's own origins; ALLOWED_ORIGINS can add more (comma-separated) without a code change.
const defaultOrigins = [
    process.env.SITE_URL || 'https://shieldiq.glitchfactory.co.ke',
    'https://shieldiq.onrender.com',
];
const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = new Set([...defaultOrigins, ...extraOrigins, 'http://localhost:3000']);
app.use(cors({
    origin(origin, cb) {
        // No Origin header = same-origin navigation, curl, server-to-server, PayPal webhook, etc.
        if (!origin || allowedOrigins.has(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    },
}));
app.set('trust proxy', 1); // Required on Render so req.ip is the real client IP, not Render's proxy

// Coarse, in-memory, per-instance safety net on top of the DB-backed auth limiter below
// (which is the real protection across multiple Render instances). Generous limits —
// this is a backstop against scripted abuse, not a UX throttle for normal use.
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
// AI question/training generation calls an external LLM and an external threat feed on every
// request -- expensive and abusable. Keep it tighter than the general API limit.
const aiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests, please slow down.' } });

const billing = require('./routes/billing');
app.post('/api/billing/paypal/webhook', express.raw({ type: '*/*' }), billing.webhookHandler);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Protected pages render everything client-side from the API, but still shouldn't linger in
// a shared computer's disk/back-button cache after logout.
const NO_STORE_PAGES = new Set(['/dashboard', '/admin', '/settings', '/billing', '/progress', '/quiz', '/it-scan']);
app.use((req, res, next) => {
    if (NO_STORE_PAGES.has(req.path)) res.set('Cache-Control', 'no-store');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

const { db, initDB } = require('./db');

async function rateLimitAuth(req, res, next) {
    if (req.method !== 'POST') return next();
    const ip = req.ip || req.connection.remoteAddress;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    try {
        const result = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM login_attempts WHERE ip = ? AND attempted_at > ?',
            args: [ip, since],
        });
        if (result.rows[0].count >= 10)
            return res.status(429).json({ message: 'Too many attempts. Please wait 15 minutes.' });
        await db.execute({
            sql: 'INSERT INTO login_attempts (ip, email) VALUES (?, ?)',
            args: [ip, req.body?.email || null],
        });
        next();
    } catch (err) {
        console.error('Rate limit error:', err);
        next();
    }
}

async function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    // Re-checks against the DB rather than trusting the token's claims as-is: a deleted/
    // deactivated account or a password change (which bumps token_version) cuts off access
    // immediately instead of waiting out the token's natural expiry. See utils/session.js.
    try {
        const { user } = await verifySession(token);
        req.user = { id: user.id, email: user.email, role: user.role };
        next();
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        console.error('authenticateToken error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin')
        return res.status(403).json({ message: 'Admin access required' });
    next();
}

const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const adminRoutes = require('./routes/admin');
const itScanRoutes = require('./routes/itScan');

app.use('/api/auth', rateLimitAuth, authRoutes);
app.use('/api/quiz/ai-questions', aiLimiter);
app.use('/api/quiz/training', aiLimiter);
app.use('/api/quiz', authenticateToken, quizRoutes);
app.use('/api/admin', authenticateToken, requireAdmin, adminRoutes);
// itScanRoutes does its own auth (IT department + Enterprise plan for
// scanning/full detail, Admin gets a risk+fixes-only view), so it isn't
// wrapped in authenticateToken/requireAdmin here — avoids double JWT
// verification and lets it apply its own department/plan rules.
app.use('/api/it', itScanRoutes);

app.get('/health', (req, res) => res.send('ok'));

app.use('/api/cron', require('./routes/cron'));

app.use('/api/billing', billing.router);

app.get('/business-trial', (req, res) => res.redirect(301, '/register-company'));
app.get('/enterprise-trial', (req, res) => res.redirect(301, '/register-company'));

app.get('/register', (req, res) => res.redirect(301, '/register-individual'));

const pages = [
    ['/', 'index.html'], ['/login', 'login.html'],
    ['/verify', 'verify.html'], ['/forgot-password', 'forgot-password.html'],
    ['/dashboard', 'dashboard.html'], ['/quiz', 'quiz.html'], ['/progress', 'progress.html'],
    ['/leaderboard', 'leaderboard.html'], ['/settings', 'settings.html'],
    ['/pricing', 'pricing.html'], ['/admin', 'admin.html'],
    ['/about', 'about.html'], ['/contact', 'contact.html'], ['/terms', 'terms.html'],
    ['/privacy', 'privacy.html'], ['/register-company', 'register-company.html'], ['/register-individual', 'register-individual.html'], ['/training', 'training.html'],
    ['/it-scan', 'it-scan.html'], ['/billing', 'billing.html'],
];

for (const [route, file] of pages) {
    app.get(route, (req, res) => res.sendFile(path.join(__dirname, 'public', file)));
}

initDB().then(() => {
    app.listen(PORT, () => console.log(`ShieldIQ running on http://localhost:${PORT}`));
}).catch(err => {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});
