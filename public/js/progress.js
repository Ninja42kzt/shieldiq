const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const userData = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('user-name').textContent = userData.name || 'User';
document.getElementById('user-company').textContent = userData.company || 'Company';
document.getElementById('user-avatar').textContent = (userData.name || 'U')[0].toUpperCase();

const categories = {
    phishing:  { title: 'Phishing Awareness', icon: '🎣' },
    passwords: { title: 'Password Security',  icon: '🔑' },
    social:    { title: 'Social Engineering', icon: '🧠' },
    devices:   { title: 'Device Security',    icon: '💻' },
    data:      { title: 'Data Protection',    icon: '🗄️' },
    incident:  { title: 'Incident Response',  icon: '🚨' }
};

const MODULE_KEYS = Object.keys(categories);

function calcStreak(results) {
    if (!results.length) return 0;
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
    return streak;
}

function getModuleScores(results) {
    const scores = {};
    MODULE_KEYS.forEach(k => {
        const r = results.filter(r => r.category === k);
        scores[k] = r.length ? Math.round(r.reduce((s, x) => s + x.score, 0) / r.length) : 0;
    });
    return scores;
}

// ── Hexagon Radar Chart ───────────────────────────────────────────────────────
function drawHexagon(scores) {
    const canvas = document.getElementById('hex-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const R = Math.min(cx, cy) - 40;
    const N = 6;
    const labels = MODULE_KEYS.map(k => categories[k].icon + ' ' + categories[k].title.split(' ')[0]);
    const values = MODULE_KEYS.map(k => (scores[k] || 0) / 100);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    function point(i, r) {
        const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    }

    // Draw grid rings
    [0.2, 0.4, 0.6, 0.8, 1.0].forEach(f => {
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
            const p = point(i, R * f);
            i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // Draw axes
    for (let i = 0; i < N; i++) {
        const p = point(i, R);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Draw data polygon
    ctx.beginPath();
    values.forEach((v, i) => {
        const p = point(i, R * Math.max(v, 0.05));
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,212,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#00D4FF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw data points
    values.forEach((v, i) => {
        const p = point(i, R * Math.max(v, 0.05));
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#00D4FF';
        ctx.fill();
    });

    // Draw labels
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
        const p = point(i, R + 24);
        ctx.fillText(label, p.x, p.y);
    });

    // Draw score % labels on axes
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#666';
    [20, 40, 60, 80, 100].forEach(pct => {
        const p = point(0, R * pct / 100);
        ctx.fillText(pct + '%', p.x + 6, p.y);
    });
}

async function loadProgress() {
    try {
        const response = await fetch('/api/quiz/results', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const results = await response.json();

        const streak = calcStreak(results);
        const moduleScores = getModuleScores(results);
        const avgScore = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;
        const bestScore = results.length ? Math.max(...results.map(r => r.score)) : 0;
        const riskLevel = avgScore >= 80 ? 'Low' : avgScore >= 60 ? 'Medium' : results.length ? 'High' : 'Unknown';

        document.getElementById('total-modules').textContent = results.length;
        document.getElementById('avg-score').textContent = avgScore + '%';
        document.getElementById('best-score').textContent = bestScore + '%';
        document.getElementById('risk-level').textContent = riskLevel;
        document.getElementById('streak-count').textContent = streak;

        drawHexagon(moduleScores);
        renderCategories(results, moduleScores);
        renderActivity(results);

    } catch (err) {
        console.error('Error loading progress:', err);
    }
}

function renderCategories(results, moduleScores) {
    const grid = document.getElementById('category-grid');
    grid.innerHTML = '';
    Object.entries(categories).forEach(([key, cat]) => {
        const catResults = results.filter(r => r.category === key);
        const done = catResults.length > 0;
        const score = moduleScores[key] || 0;
        const color = score >= 80 ? '#34c759' : score >= 60 ? '#ff9f0a' : done ? '#ff6b6b' : '#444';
        grid.innerHTML += `
            <div class="category-card ${!done ? 'not-started' : ''}">
                <div class="category-header">
                    <div class="category-title"><span>${cat.icon}</span><span>${cat.title}</span></div>
                    <span class="category-score" style="color:${color}">${done ? score + '%' : 'Not started'}</span>
                </div>
                <div class="category-bar">
                    <div class="category-bar-fill" style="width:${score}%;background:${color}"></div>
                </div>
                <div class="category-meta">${done ? `Completed ${catResults.length} time${catResults.length > 1 ? 's' : ''}` : 'Click Training to start'}</div>
            </div>
        `;
    });
}

function renderActivity(results) {
    const list = document.getElementById('activity-list');
    if (!results.length) return;
    list.innerHTML = '';
    results.slice(0, 10).forEach(r => {
        const cat = categories[r.category] || { title: r.category, icon: '📚' };
        const color = r.score >= 80 ? '#34c759' : r.score >= 60 ? '#ff9f0a' : '#ff6b6b';
        const date = new Date(r.taken_at).toLocaleDateString('en-KE', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        list.innerHTML += `
            <div class="activity-item">
                <div class="activity-icon">${cat.icon}</div>
                <div class="activity-info">
                    <div class="activity-title">${cat.title}</div>
                    <div class="activity-time">${date}</div>
                </div>
                <div class="activity-score" style="color:${color}">${r.score}%</div>
            </div>
        `;
    });
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

loadProgress();