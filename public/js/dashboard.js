// Check auth
const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

function parseJWT(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch (e) { return null; }
}

const user = parseJWT(token);
if (user) {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('welcome-name').textContent = userData.name || 'User';
    document.getElementById('user-name').textContent = userData.name || 'User';
    document.getElementById('user-company').textContent = userData.company || 'Company';
    document.getElementById('user-avatar').textContent = (userData.name || 'U')[0].toUpperCase();
}

async function loadStats() {
    try {
        const res = await fetch('/api/quiz/stats', { headers: { 'Authorization': `Bearer ${token}` } });
        const stats = await res.json();
        document.getElementById('modules-done').textContent = stats.modulesDone;
        document.getElementById('avg-score').textContent = stats.avgScore + '%';
        document.getElementById('risk-level').textContent = stats.riskLevel;
    } catch (err) { console.error('Could not load stats'); }
}

async function loadRecommendations() {
    const container = document.getElementById('recommend-list');
    if (!container) return;
    try {
        const res = await fetch('/api/quiz/recommend', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        const items = Array.isArray(data) ? data : (data.recommendations || []);
        if (!items.length) {
            container.classList.remove('modules-grid');
            container.innerHTML = '<p style="color:var(--text-muted);font-size:14px">Complete a quiz to get personalised recommendations.</p>';
            return;
        }

        container.classList.add('modules-grid');
        const icons = { phishing: '🎣', passwords: '🔑', social: '🧠', devices: '💻', data: '🗄️', incident: '🚨' };
        container.innerHTML = items.map(r => `
            <div class="module-card" onclick="window.location.href='/quiz?cat=${r.module}'" style="cursor:pointer">
                <div class="module-icon">${icons[r.module] || '📚'}</div>
                <div class="module-info">
                    <h3>${r.title || r.module}</h3>
                    <p style="color:var(--text-muted);font-size:13px">${r.reason || 'Recommended for you'}</p>
                </div>
                <div class="module-arrow">→</div>
            </div>
        `).join('');
    } catch (err) { console.error('Could not load recommendations'); }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

loadStats();
loadRecommendations();