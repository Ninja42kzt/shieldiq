const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { processTrials } = require('../utils/trial');

function safeEqual(a, b) {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Call daily from an external scheduler:
//   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<site>/api/cron/trial-check
router.post('/trial-check', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || !safeEqual(req.headers['x-cron-secret'], secret)) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        res.json({ ok: true, sent: await processTrials() });
    } catch (e) {
        console.error('trial-check failed:', e);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
