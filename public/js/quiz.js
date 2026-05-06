const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');

function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// Save quiz result — now properly saves weak_areas
router.post('/result', auth, (req, res) => {
    const { category, score, total, wrongQuestions } = req.body;

    try {
        // wrongQuestions is an array of topic strings the user got wrong
        // e.g. ["Phishing Links", "Email Spoofing", "Password Reuse"]
        const weakAreas = Array.isArray(wrongQuestions)
            ? wrongQuestions.join(',')
            : '';

        db.prepare(
            'INSERT INTO quiz_results (user_id, category, score, weak_areas) VALUES (?, ?, ?, ?)'
        ).run(req.user.id, category, score, weakAreas);

        res.json({ message: 'Result saved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error saving result' });
    }
});

// Get user results
router.get('/results', auth, (req, res) => {
    try {
        const results = db.prepare(
            'SELECT * FROM quiz_results WHERE user_id = ? ORDER BY taken_at DESC'
        ).all(req.user.id);
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching results' });
    }
});

// Get user stats
router.get('/stats', auth, (req, res) => {
    try {
        const results = db.prepare(
            'SELECT * FROM quiz_results WHERE user_id = ?'
        ).all(req.user.id);

        const modulesDone = results.length;
        const avgScore = modulesDone > 0
            ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / modulesDone)
            : 0;

        let riskLevel;
        if (avgScore >= 80) riskLevel = 'Low';
        else if (avgScore >= 60) riskLevel = 'Medium';
        else if (avgScore > 0) riskLevel = 'High';
        else riskLevel = 'Unknown';

        // Aggregate weak areas
        const weakCounts = {};
        results.forEach(r => {
            if (r.weak_areas) {
                r.weak_areas.split(',').filter(Boolean).forEach(area => {
                    weakCounts[area] = (weakCounts[area] || 0) + 1;
                });
            }
        });

        const weakAreas = Object.entries(weakCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([area]) => area);

        res.json({ modulesDone, avgScore, riskLevel, weakAreas });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
});

// Leaderboard
router.get('/leaderboard', auth, (req, res) => {
    try {
        const rankings = db.prepare(`
            SELECT u.name, u.company,
                   ROUND(AVG(q.score)) as avg_score,
                   COUNT(q.id) as modules
            FROM users u
            JOIN quiz_results q ON u.id = q.user_id
            GROUP BY u.id
            ORDER BY avg_score DESC
            LIMIT 20
        `).all();
        res.json(rankings);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching leaderboard' });
    }
});

module.exports = router;
