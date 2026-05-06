const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');

// Admin auth middleware
function adminAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// GET /api/admin/stats — company-wide stats
router.get('/stats', adminAuth, (req, res) => {
    try {
        const adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const company = adminUser.company;

        const users = db.prepare(
            'SELECT id, name, email, role, plan, created_at FROM users WHERE company = ?'
        ).all(company);

        const results = db.prepare(`
            SELECT q.*, u.name as user_name FROM quiz_results q
            JOIN users u ON q.user_id = u.id
            WHERE u.company = ?
            ORDER BY q.taken_at DESC
        `).all(company);

        const totalUsers = users.length;
        const activeUsers = [...new Set(results.map(r => r.user_id))].length;
        const avgScore = results.length > 0
            ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
            : 0;

        // Risk breakdown
        const userScores = {};
        results.forEach(r => {
            if (!userScores[r.user_id]) userScores[r.user_id] = [];
            userScores[r.user_id].push(r.score);
        });

        let low = 0, medium = 0, high = 0, unknown = 0;
        users.forEach(u => {
            const scores = userScores[u.id];
            if (!scores || scores.length === 0) { unknown++; return; }
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            if (avg >= 80) low++;
            else if (avg >= 60) medium++;
            else high++;
        });

        res.json({ totalUsers, activeUsers, avgScore, riskBreakdown: { low, medium, high, unknown } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/users — user list with risk levels and weak areas
router.get('/users', adminAuth, (req, res) => {
    try {
        const adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const company = adminUser.company;

        const users = db.prepare(
            'SELECT id, name, email, role, plan, created_at FROM users WHERE company = ?'
        ).all(company);

        const enriched = users.map(u => {
            const results = db.prepare(
                'SELECT score, weak_areas, category, taken_at FROM quiz_results WHERE user_id = ? ORDER BY taken_at DESC'
            ).all(u.id);

            const modulesDone = results.length;
            const avgScore = modulesDone > 0
                ? Math.round(results.reduce((s, r) => s + r.score, 0) / modulesDone)
                : null;

            let riskLevel = 'Unknown';
            if (avgScore !== null) {
                if (avgScore >= 80) riskLevel = 'Low';
                else if (avgScore >= 60) riskLevel = 'Medium';
                else riskLevel = 'High';
            }

            // Aggregate weak areas
            const allWeakAreas = [];
            results.forEach(r => {
                if (r.weak_areas) {
                    try {
                        const parsed = JSON.parse(r.weak_areas);
                        if (Array.isArray(parsed)) allWeakAreas.push(...parsed);
                    } catch(e) {}
                }
            });
            const weakAreaCounts = {};
            allWeakAreas.forEach(a => { weakAreaCounts[a] = (weakAreaCounts[a] || 0) + 1; });
            const topWeakAreas = Object.entries(weakAreaCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([area]) => area);

            const lastActive = results.length > 0 ? results[0].taken_at : null;

            return { ...u, modulesDone, avgScore, riskLevel, topWeakAreas, lastActive };
        });

        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/weak-areas — aggregated weak areas across the company
router.get('/weak-areas', adminAuth, (req, res) => {
    try {
        const adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const company = adminUser.company;

        const results = db.prepare(`
            SELECT q.weak_areas, q.category FROM quiz_results q
            JOIN users u ON q.user_id = u.id
            WHERE u.company = ? AND q.weak_areas IS NOT NULL
        `).all(company);

        const weakAreaCounts = {};
        results.forEach(r => {
            try {
                const areas = JSON.parse(r.weak_areas);
                if (Array.isArray(areas)) {
                    areas.forEach(a => { weakAreaCounts[a] = (weakAreaCounts[a] || 0) + 1; });
                }
            } catch(e) {}
        });

        const sorted = Object.entries(weakAreaCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([area, count]) => ({ area, count }));

        res.json(sorted);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/upgrade — upgrade user plan
router.post('/upgrade', adminAuth, (req, res) => {
    const { userId, plan } = req.body;
    if (!['free', 'pro'].includes(plan))
        return res.status(400).json({ message: 'Invalid plan' });
    try {
        db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
        res.json({ message: `User plan updated to ${plan}` });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;