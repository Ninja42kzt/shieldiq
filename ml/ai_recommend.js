const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { MODULE_TOPICS } = require('./ai_quiz');
 
const ALL_MODULES = Object.keys(MODULE_TOPICS);
const MODELS_DIR = path.join(__dirname, 'models');
const RISK_MODEL = path.join(MODELS_DIR, 'risk_model.pkl');
const REC_MODEL = path.join(MODELS_DIR, 'recommend_model.pkl');
 
// Check if trained models exist
function modelsExist() {
    return fs.existsSync(RISK_MODEL) && fs.existsSync(REC_MODEL);
}
 
// Call Python model via child process
function callPythonModel(results) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'predict.py');
        const proc = execFile('python3', [scriptPath], { timeout: 10000 }, (err, stdout, stderr) => {
            if (err) return reject(err);
            try {
                const result = JSON.parse(stdout.trim());
                if (result.error) return reject(new Error(result.error));
                resolve(result);
            } catch (e) {
                reject(new Error(`Python parse error: ${e.message}`));
            }
        });
        proc.stdin.write(JSON.stringify(results));
        proc.stdin.end();
    });
}
 
// JS fallback logic (used when models not trained yet)
function getRecommendationsFallback(results) {
    if (!results || results.length === 0) {
        return {
            priority: ALL_MODULES,
            topPriority: 'phishing',
            reason: "Start with Phishing Awareness — it's the #1 cause of breaches in East Africa.",
            moduleScores: {},
            completedModules: [],
            incompleteModules: ALL_MODULES,
            riskLevel: 'Unknown',
            avgScore: 0,
            source: 'fallback'
        };
    }
 
    const moduleMap = {};
    results.forEach(r => {
        const cat = r.category;
        if (!moduleMap[cat]) moduleMap[cat] = { scores: [], weakAreas: [] };
        moduleMap[cat].scores.push(r.score);
        if (r.weak_areas) {
            try {
                const areas = JSON.parse(r.weak_areas);
                if (Array.isArray(areas)) moduleMap[cat].weakAreas.push(...areas);
            } catch {}
        }
    });
 
    const moduleScores = {};
    Object.entries(moduleMap).forEach(([cat, data]) => {
        moduleScores[cat] = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
    });
 
    const completedModules = Object.keys(moduleScores);
    const incompleteModules = ALL_MODULES.filter(m => !completedModules.includes(m));
    const weakModules = completedModules.filter(m => moduleScores[m] < 80).sort((a, b) => moduleScores[a] - moduleScores[b]);
    const priority = [...incompleteModules, ...weakModules];
    const topPriority = priority[0] || null;
 
    const allScores = Object.values(moduleScores);
    const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
 
    let riskLevel = completedModules.length === 0 ? 'Unknown' : avgScore >= 80 ? 'Low' : avgScore >= 60 ? 'Medium' : 'High';
 
    let reason;
    if (incompleteModules.length > 0 && topPriority) {
        reason = `You haven't started ${MODULE_TOPICS[topPriority]?.title} yet. Complete it to reduce your risk profile.`;
    } else if (topPriority && moduleScores[topPriority] !== undefined) {
        reason = `Your score in ${MODULE_TOPICS[topPriority]?.title} is ${moduleScores[topPriority]}% — below the safe threshold of 80%. Focus here first.`;
    } else {
        reason = 'Great work! All modules completed above 80%. Keep practising to maintain your score.';
    }
 
    const allWeakAreas = [];
    Object.values(moduleMap).forEach(data => allWeakAreas.push(...data.weakAreas));
    const weakAreaCounts = {};
    allWeakAreas.forEach(area => { weakAreaCounts[area] = (weakAreaCounts[area] || 0) + 1; });
    const topWeakAreas = Object.entries(weakAreaCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([area]) => area);
 
    return { priority, topPriority, reason, moduleScores, completedModules, incompleteModules, riskLevel, avgScore, topWeakAreas, source: 'fallback' };
}
 
// Main export — auto-switches between Python model and JS fallback
async function getRecommendations(results) {
    if (modelsExist()) {
        try {
            const pythonResult = await callPythonModel(results);
            console.log('[AI] Using trained Python model for recommendations');
 
            // Format Python output to match expected structure
            const completedModules = ALL_MODULES.filter(m => pythonResult.moduleScores?.[m] > 0);
            const incompleteModules = ALL_MODULES.filter(m => !completedModules.includes(m));
            const priority = [pythonResult.nextModule, ...incompleteModules.filter(m => m !== pythonResult.nextModule)];
 
            return {
                priority,
                topPriority: pythonResult.nextModule,
                reason: `Based on your performance data, ${MODULE_TOPICS[pythonResult.nextModule]?.title} needs the most attention.`,
                moduleScores: pythonResult.moduleScores || {},
                completedModules,
                incompleteModules,
                riskLevel: pythonResult.riskLevel,
                avgScore: pythonResult.avgScore,
                source: 'ml_model'
            };
        } catch (err) {
            console.warn('[AI] Python model failed, using fallback:', err.message);
        }
    }
 
    return getRecommendationsFallback(results);
}
 
module.exports = { getRecommendations };