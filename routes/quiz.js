const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');

// Middleware to verify token
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

// Save quiz result
router.post('/result', auth, (req, res) => {
    const { category, score, total, correct } = req.body;
    try {
        db.prepare(
            'INSERT INTO quiz_results (user_id, category, score) VALUES (?, ?, ?)'
        ).run(req.user.id, category, score);
        res.json({ message: 'Result saved' });
    } catch (err) {
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

module.exports = router;