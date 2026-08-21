const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { db } = require("../db");
const { generateQuestions } = require('../ml/ai_quiz');
const { getRecommendations } = require('../ml/ai_recommend');
 
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
router.post('/result', auth, async (req, res) => {
    const { category, score, total, correct, weakAreas } = req.body;
    try {
        const weakAreasJson = weakAreas && weakAreas.length > 0
            ? JSON.stringify(weakAreas)
            : null;
 
        await db.execute({
            sql: 'INSERT INTO quiz_results (user_id, category, score, weak_areas) VALUES (?, ?, ?, ?)',
            args: [req.user.id, category, score, weakAreasJson],
        });
 
        res.json({ message: 'Result saved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error saving result' });
    }
});
 
// Get user results
router.get('/results', auth, async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM quiz_results WHERE user_id = ? ORDER BY taken_at DESC',
            args: [req.user.id],
        });
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching results' });
    }
});
 
// Get user stats
router.get('/stats', auth, async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM quiz_results WHERE user_id = ?',
            args: [req.user.id],
        });
        const results = result.rows;
 
        const modulesDone = results.length;
        const avgScore = modulesDone > 0
            ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / modulesDone)
            : 0;
 
        const allWeakAreas = [];
        results.forEach(r => {
            if (r.weak_areas) {
                try {
                    const parsed = JSON.parse(r.weak_areas);
                    if (Array.isArray(parsed)) allWeakAreas.push(...parsed);
                } catch (e) {}
            }
        });
 
        const weakAreaCounts = {};
        allWeakAreas.forEach(area => {
            weakAreaCounts[area] = (weakAreaCounts[area] || 0) + 1;
        });
 
        const topWeakAreas = Object.entries(weakAreaCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([area]) => area);
 
        let riskLevel;
        if (avgScore >= 80) riskLevel = 'Low';
        else if (avgScore >= 60) riskLevel = 'Medium';
        else if (avgScore > 0) riskLevel = 'High';
        else riskLevel = 'Unknown';
 
        // Calculate streak — consecutive days with at least one quiz
        const days = [...new Set(results.map(r => new Date(r.taken_at).toDateString()))];
        days.sort((a, b) => new Date(b) - new Date(a));
        let streak = 0;
        let current = new Date();
        current.setHours(0, 0, 0, 0);
        for (const day of days) {
            const d = new Date(day);
            d.setHours(0, 0, 0, 0);
            const diff = (current - d) / (1000 * 60 * 60 * 24);
            if (diff <= 1) { streak++; current = d; }
            else break;
        }
 
        res.json({ modulesDone, avgScore, riskLevel, topWeakAreas, streak });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching stats' });
    }
});
 
// Leaderboard
router.get('/leaderboard', auth, async (req, res) => {
    try {
        const result = await db.execute({
            sql: `SELECT u.name, u.company,
                         ROUND(AVG(q.score)) as avg_score,
                         COUNT(q.id) as modules
                  FROM users u
                  JOIN quiz_results q ON u.id = q.user_id
                  GROUP BY u.id
                  ORDER BY avg_score DESC
                  LIMIT 20`,
            args: [],
        });
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching leaderboard' });
    }
});
 
// AI-generated questions for a module
router.get('/ai-questions/:module', auth, async (req, res) => {
    const { module } = req.params;
    const count = parseInt(req.query.count) || 5;
 
    const validModules = ['phishing', 'passwords', 'social', 'devices', 'data', 'incident'];
    if (!validModules.includes(module)) {
        return res.status(400).json({ message: 'Invalid module' });
    }
 
    try {
        const questions = await generateQuestions(module, count);
        res.json({ module, questions, source: 'ai', generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('AI quiz generation error:', err.message);
        res.status(500).json({ message: 'Failed to generate questions. Please try again.', error: err.message });
    }
});
 
// Personalised module recommendations
router.get('/recommend', auth, async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM quiz_results WHERE user_id = ? ORDER BY taken_at DESC',
            args: [req.user.id],
        });
 
        const recommendations = getRecommendations(result.rows);
        res.json(recommendations);
    } catch (err) {
        console.error('Recommendation error:', err.message);
        res.status(500).json({ message: 'Error generating recommendations' });
    }
});
 
// Generate training content for weak areas
router.post('/training', auth, async (req, res) => {
    const { weakAreas, module: mod } = req.body;
    if (!weakAreas || !weakAreas.length) {
        return res.status(400).json({ message: 'No weak areas provided' });
    }

    try {
        const { generateTrainingContent } = require('../ml/ai_quiz');
        const content = await generateTrainingContent(mod, weakAreas);
        res.json({ content });
    } catch (err) {
        console.error('Training content error:', err.message);
        res.status(500).json({ message: 'Failed to generate training content' });
    }
});

module.exports = router;