const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const repoService = require('../services/codeguard/repoService');
const analysisService = require('../services/codeguard/analysisService');

// CodeGuard is an Enterprise-only, IT-department feature:
//   - Only users in the IT department can run scans or view full,
//     file-level vulnerability detail (repo contents are sensitive infra
//     info that shouldn't be broadly visible).
//   - Company Admins can see that scanning happened and the resulting
//     risk score + recommended fixes, but not the raw vulnerability list.
//   - The whole feature is gated to the Enterprise plan.
const ENTERPRISE_PLANS = ['enterprise', 'enterprise_trial'];

// Resolves the caller from their JWT and loads their current role/
// department/plan from the DB (not trusted from the token, since those
// can change after a token was issued).
async function loadRequester(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
    try {
        const result = await db.execute({
            sql: 'SELECT id, company, role, department, plan FROM users WHERE id = ?',
            args: [decoded.id],
        });
        const user = result.rows[0];
        if (!user) return res.status(401).json({ message: 'Invalid token' });
        req.user = user;
        next();
    } catch (err) {
        console.error('CodeGuard auth error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

function requireEnterprisePlan(req, res, next) {
    if (!ENTERPRISE_PLANS.includes(req.user.plan)) {
        return res.status(403).json({
            message: 'CodeGuard is an Enterprise plan feature. Upgrade to Enterprise to enable code security scanning.',
        });
    }
    next();
}

function isIT(user) {
    return (user.department || '').toLowerCase() === 'it';
}
function isAdmin(user) {
    return user.role === 'admin' || user.role === 'superadmin';
}

// Scanning and full vulnerability detail: IT department only.
function requireITDepartment(req, res, next) {
    if (!isIT(req.user)) {
        return res.status(403).json({ message: 'CodeGuard scanning is restricted to the IT department.' });
    }
    next();
}

// Viewing scan results at all: IT department, or a company Admin (who
// gets a reduced view — see GET /scans/:id below).
function requireAdminOrIT(req, res, next) {
    if (!isIT(req.user) && !isAdmin(req.user)) {
        return res.status(403).json({ message: 'CodeGuard is only visible to IT staff and company admins.' });
    }
    next();
}

// POST /api/it/scan — kick off a repo scan, scoped to the caller's company
router.post('/scan', loadRequester, requireEnterprisePlan, requireITDepartment, async (req, res) => {
    const { repoUrl, branch = 'main' } = req.body;
    if (!repoUrl) return res.status(400).json({ message: 'repoUrl is required' });
    if (!repoService.isValidGitHubUrl(repoUrl)) {
        return res.status(400).json({ message: 'Invalid GitHub repository URL' });
    }

    const company = req.user.company;

    const insertResult = await db.execute({
        sql: `INSERT INTO code_scans (company, requested_by, repo_url, branch, status)
              VALUES (?, ?, ?, ?, 'running')`,
        args: [company, req.user.id, repoUrl, branch],
    });
    const scanId = Number(insertResult.lastInsertRowid);

    // Respond immediately with the scan id; run the actual clone+analyze
    // in the background and update the row when done. A real repo can take
    // longer than most client timeouts are comfortable with.
    res.status(202).json({ scanId, status: 'running' });

    let clonePath = null;
    try {
        const cloneResult = await repoService.cloneRepository(repoUrl, branch);
        clonePath = cloneResult.clonePath;

        const analysis = await analysisService.analyzeRepository(clonePath);

        await db.execute({
            sql: `UPDATE code_scans
                  SET status = 'complete', risk_score = ?, summary = ?, vulnerabilities = ?, recommendations = ?, completed_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            args: [
                analysis.riskScore,
                JSON.stringify(analysis.summary),
                JSON.stringify(analysis.vulnerabilities),
                JSON.stringify(analysis.recommendations),
                scanId,
            ],
        });
    } catch (err) {
        await db.execute({
            sql: `UPDATE code_scans SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [err.message, scanId],
        });
    } finally {
        if (clonePath) await repoService.cleanupRepository(clonePath);
    }
});

// GET /api/it/scans — scan history for the caller's company.
// Available to IT and Admin alike; this list view never included raw
// vulnerability detail, only status/risk score, so it's safe for both.
router.get('/scans', loadRequester, requireEnterprisePlan, requireAdminOrIT, async (req, res) => {
    const scansResult = await db.execute({
        sql: `SELECT id, repo_url, branch, status, risk_score, summary, error, created_at, completed_at
              FROM code_scans WHERE company = ? ORDER BY created_at DESC`,
        args: [req.user.company],
    });
    res.json({ scans: scansResult.rows, view: isIT(req.user) ? 'it' : 'admin' });
});

// GET /api/it/scans/:id — single scan detail.
//  - IT department: full detail, including the file-level vulnerability list.
//  - Admin (not IT): risk score, severity summary, and recommended fixes
//    only — no raw vulnerabilities/file paths/code snippets.
router.get('/scans/:id', loadRequester, requireEnterprisePlan, requireAdminOrIT, async (req, res) => {
    const scanResult = await db.execute({
        sql: 'SELECT * FROM code_scans WHERE id = ? AND company = ?',
        args: [req.params.id, req.user.company],
    });
    const scan = scanResult.rows[0];
    if (!scan) return res.status(404).json({ message: 'Scan not found' });

    if (isIT(req.user)) {
        return res.json({ scan, view: 'it' });
    }

    // Admin-restricted view: risks + recommended fixes only.
    const { vulnerabilities, ...adminSafeScan } = scan;
    res.json({ scan: adminSafeScan, view: 'admin' });
});

module.exports = router;
