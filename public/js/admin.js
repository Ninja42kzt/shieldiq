const express = require('express');
const router = express.Router();
const db = require('../db');

// Company stats overview
router.get('/stats', (req, res) => {
    try {
        const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const company = admin.company;

        const totalUsers = db.prepare(
            `SELECT COUNT(*) as count FROM users WHERE company = ? AND role = 'employee'`
        ).get(company).count;

        const trainedUsers = db.prepare(
            `SELECT COUNT(DISTINCT u.id) as count FROM users u
             JOIN quiz_results q ON u.id = q.user_id
             WHERE u.company = ?`
        ).get(company).count;

        const avgScore = db.prepare(
            `SELECT ROUND(AVG(q.score)) as avg FROM quiz_results q
             JOIN users u ON q.user_id = u.id
             WHERE u.company = ?`
        ).get(company).avg || 0;

        const highRisk = db.prepare(
            `SELECT COUNT(DISTINCT u.id) as count FROM users u
             JOIN quiz_results q ON u.id = q.user_id
             WHERE u.company = ?
             GROUP BY u.id
             HAVING AVG(q.score) < 60`
        ).all(company).length;

        res.json({ totalUsers, trainedUsers, avgScore, highRisk });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// All users in company with their stats
router.get('/users', (req, res) => {
    try {
        const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const company = admin.company;

        const users = db.prepare(
            `SELECT u.id, u.name, u.email, u.role, u.created_at,
                    ROUND(AVG(q.score)) as avg_score,
                    COUNT(q.id) as modules_done,
                    GROUP_CONCAT(DISTINCT q.weak_areas) as all_weak_areas
             FROM users u
             LEFT JOIN quiz_results q ON u.id = q.user_id
             WHERE u.company = ? AND u.role = 'employee'
             GROUP BY u.id
             ORDER BY avg_score ASC`
        ).all(company);

        // Add risk level and parse weak areas
        const enriched = users.map(u => {
            let riskLevel = 'Not trained';
            if (u.avg_score !== null) {
                if (u.avg_score >= 80) riskLevel = 'Low';
                else if (u.avg_score >= 60) riskLevel = 'Medium';
                else riskLevel = 'High';
            }

            // Aggregate weak areas across all quizzes
            let weakAreas = [];
            if (u.all_weak_areas) {
                const raw = u.all_weak_areas.split(',').filter(Boolean);
                const counts = {};
                raw.forEach(w => { counts[w] = (counts[w] || 0) + 1; });
                weakAreas = Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([area]) => area);
            }

            return { ...u, riskLevel, weakAreas };
        });

        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Weak areas breakdown across whole company
router.get('/weak-areas', (req, res) => {
    try {
        const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const company = admin.company;

        const results = db.prepare(
            `SELECT q.category, q.weak_areas, q.score
             FROM quiz_results q
             JOIN users u ON q.user_id = u.id
             WHERE u.company = ? AND q.weak_areas IS NOT NULL AND q.weak_areas != ''`
        ).all(company);

        // Count weak area occurrences
        const counts = {};
        results.forEach(r => {
            if (r.weak_areas) {
                r.weak_areas.split(',').filter(Boolean).forEach(area => {
                    counts[area] = (counts[area] || 0) + 1;
                });
            }
        });

        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([area, count]) => ({ area, count }));

        res.json(sorted);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Category scores across company
router.get('/category-scores', (req, res) => {
    try {
        const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const company = admin.company;

        const scores = db.prepare(
            `SELECT q.category, ROUND(AVG(q.score)) as avg_score, COUNT(q.id) as attempts
             FROM quiz_results q
             JOIN users u ON q.user_id = u.id
             WHERE u.company = ?
             GROUP BY q.category
             ORDER BY avg_score ASC`
        ).all(company);

        res.json(scores);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Promote user to admin
router.post('/promote/:userId', (req, res) => {
    try {
        const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);

        if (!target || target.company !== admin.company) {
            return res.status(403).json({ message: 'User not in your company' });
        }

        db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(req.params.userId);
        res.json({ message: 'User promoted to admin' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Remove user from company
router.delete('/user/:userId', (req, res) => {
    try {
        const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);

        if (!target || target.company !== admin.company) {
            return res.status(403).json({ message: 'User not in your company' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.userId);
        res.json({ message: 'User removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
