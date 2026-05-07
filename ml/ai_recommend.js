const { MODULE_TOPICS } = require('./ai_quiz');

const ALL_MODULES = Object.keys(MODULE_TOPICS);

/**
 * Analyse a user's quiz results and return personalised recommendations.
 * Pure logic — no external API needed.
 *
 * @param {Array} results - rows from quiz_results table for this user
 * @returns {Object} recommendations
 */
function getRecommendations(results) {
    if (!results || results.length === 0) {
        // No results yet — recommend starting with phishing (most common threat)
        return {
            priority: ALL_MODULES,
            topPriority: 'phishing',
            reason: 'Start with Phishing Awareness — it\'s the #1 cause of breaches in East Africa.',
            moduleScores: {},
            completedModules: [],
            incompleteModules: ALL_MODULES,
            riskLevel: 'Unknown',
            avgScore: 0
        };
    }

    // Build per-module stats (take best score per module)
    const moduleMap = {};
    results.forEach(r => {
        const cat = r.category;
        if (!moduleMap[cat]) {
            moduleMap[cat] = { scores: [], weakAreas: [] };
        }
        moduleMap[cat].scores.push(r.score);

        if (r.weak_areas) {
            try {
                const areas = JSON.parse(r.weak_areas);
                if (Array.isArray(areas)) moduleMap[cat].weakAreas.push(...areas);
            } catch {}
        }
    });

    // Calculate average score per module
    const moduleScores = {};
    Object.entries(moduleMap).forEach(([cat, data]) => {
        moduleScores[cat] = Math.round(
            data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        );
    });

    const completedModules = Object.keys(moduleScores);
    const incompleteModules = ALL_MODULES.filter(m => !completedModules.includes(m));

    // Sort completed modules by score ascending (worst first)
    const weakModules = completedModules
        .filter(m => moduleScores[m] < 80)
        .sort((a, b) => moduleScores[a] - moduleScores[b]);

    // Priority order: incomplete first, then weak completed modules
    const priority = [...incompleteModules, ...weakModules];

    const topPriority = priority[0] || null;

    // Overall avg score
    const allScores = Object.values(moduleScores);
    const avgScore = allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0;

    // Risk level
    let riskLevel;
    if (completedModules.length === 0) riskLevel = 'Unknown';
    else if (avgScore >= 80) riskLevel = 'Low';
    else if (avgScore >= 60) riskLevel = 'Medium';
    else riskLevel = 'High';

    // Generate reason message
    let reason;
    if (incompleteModules.length > 0 && topPriority) {
        reason = `You haven't started ${MODULE_TOPICS[topPriority]?.title} yet. Complete it to reduce your risk profile.`;
    } else if (topPriority && moduleScores[topPriority] !== undefined) {
        reason = `Your score in ${MODULE_TOPICS[topPriority]?.title} is ${moduleScores[topPriority]}% — below the safe threshold of 80%. Focus here first.`;
    } else {
        reason = 'Great work! All modules completed above 80%. Keep practising to maintain your score.';
    }

    // Collect all weak areas across all modules
    const allWeakAreas = [];
    Object.values(moduleMap).forEach(data => allWeakAreas.push(...data.weakAreas));
    const weakAreaCounts = {};
    allWeakAreas.forEach(area => {
        weakAreaCounts[area] = (weakAreaCounts[area] || 0) + 1;
    });
    const topWeakAreas = Object.entries(weakAreaCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([area]) => area);

    return {
        priority,
        topPriority,
        reason,
        moduleScores,
        completedModules,
        incompleteModules,
        riskLevel,
        avgScore,
        topWeakAreas
    };
}

module.exports = { getRecommendations };
