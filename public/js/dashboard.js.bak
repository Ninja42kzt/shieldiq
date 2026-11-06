const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

function parseJWT(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch (e) { return null; }
}

const userData = JSON.parse(localStorage.getItem('user') || '{}');
const plan = userData.plan || 'free';

// Redirect admin to admin panel
if (userData.role === 'admin') { window.location.href = '/admin'; }

// CodeGuard nav link: only IT department employees see it
if ((userData.department || '').toLowerCase() === 'it') {
    const cgNav = document.getElementById('nav-codeguard');
    if (cgNav) cgNav.style.display = 'flex';
}

// Plan config
const isPremium = ['business_trial', 'business', 'enterprise_trial', 'enterprise'].includes(plan);
const isEnterprise = ['enterprise_trial', 'enterprise'].includes(plan);

if (userData.name) {
    document.getElementById('welcome-name').textContent = userData.name;
    document.getElementById('user-name').textContent = userData.name;
    document.getElementById('user-company').textContent = userData.company || 'Company';
    document.getElementById('user-avatar').textContent = userData.name[0].toUpperCase();
}

// Show plan badge in sidebar
const planBadges = {
    free: { label: 'Free', color: '#666' },
    business_trial: { label: 'Business Trial', color: '#00D4FF' },
    business: { label: 'Business', color: '#00D4FF' },
    enterprise_trial: { label: 'Enterprise Trial', color: '#bf5af2' },
    enterprise: { label: 'Enterprise', color: '#bf5af2' }
};
const badge = planBadges[plan] || planBadges.free;
const companyEl = document.getElementById('user-company');
if (companyEl) {
    companyEl.innerHTML = `${userData.company || 'Company'} <span style="background:${badge.color}22;color:${badge.color};font-size:10px;padding:2px 6px;border-radius:4px;margin-left:4px">${badge.label}</span>`;
}

// Redirect admin users to admin panel
if (userData.role === 'admin') {
    window.location.href = '/admin';
}

async function loadStats() {
    try {
        const res = await fetch('/api/quiz/stats', { headers: { 'Authorization': `Bearer ${token}` } });
        const stats = await res.json();
        document.getElementById('modules-done').textContent = stats.modulesDone;
        document.getElementById('avg-score').textContent = stats.avgScore + '%';
        document.getElementById('risk-level').textContent = stats.riskLevel;
        if (document.getElementById('streak')) {
            document.getElementById('streak').textContent = stats.streak || 0;
        }
    } catch (err) { console.error('Could not load stats'); }
}

async function loadRecommendations() {
    const container = document.getElementById('recommend-list');
    const section = document.getElementById('recommend-section');
    if (!container) return;

    // Hide recommendations for free users
    if (!isPremium) {
        if (section) section.innerHTML = `
            <h2>Recommended for You</h2>
            <div style="background:var(--glass);border:1px solid var(--glass-border);border-radius:12px;padding:24px;text-align:center">
                <p style="color:var(--text-muted);margin-bottom:12px">🤖 AI-powered recommendations are available on Business and Enterprise plans.</p>
                <a href="/pricing" style="color:var(--primary);font-weight:600;font-size:14px">Upgrade to unlock →</a>
            </div>
        `;
        return;
    }

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

function lockModule(name, icon) {
    return `
        <div class="module-card" style="opacity:0.5;cursor:not-allowed" onclick="window.location.href='/pricing'">
            <div class="module-icon">${icon}</div>
            <div class="module-info">
                <h3>${name}</h3>
                <p style="color:var(--text-muted);font-size:13px">🔒 Upgrade to Business to unlock</p>
            </div>
            <div class="module-arrow">→</div>
        </div>
    `;
}

function renderModules() {
    const grid = document.getElementById('modules-grid');
    if (!grid) return;

    const freeModules = `
        <div class="module-card" onclick="window.location.href='/quiz?cat=phishing'">
            <div class="module-icon">🎣</div>
            <div class="module-info">
                <h3>Phishing Awareness</h3>
                <p>Learn to identify phishing emails and MPESA scams</p>
                <div class="module-meta"><span class="difficulty easy">Beginner</span><span>10 questions</span></div>
            </div><div class="module-arrow">→</div>
        </div>
        <div class="module-card" onclick="window.location.href='/quiz?cat=passwords'">
            <div class="module-icon">🔑</div>
            <div class="module-info">
                <h3>Password Security</h3>
                <p>Best practices for creating and managing passwords</p>
                <div class="module-meta"><span class="difficulty easy">Beginner</span><span>8 questions</span></div>
            </div><div class="module-arrow">→</div>
        </div>
        <div class="module-card" onclick="window.location.href='/quiz?cat=social'">
            <div class="module-icon">🧠</div>
            <div class="module-info">
                <h3>Social Engineering</h3>
                <p>Recognize manipulation tactics used by attackers</p>
                <div class="module-meta"><span class="difficulty medium">Intermediate</span><span>12 questions</span></div>
            </div><div class="module-arrow">→</div>
        </div>
    `;

    const premiumModules = `
        <div class="module-card" onclick="window.location.href='/quiz?cat=devices'">
            <div class="module-icon">💻</div>
            <div class="module-info">
                <h3>Device Security</h3>
                <p>Keeping your work devices and data safe</p>
                <div class="module-meta"><span class="difficulty medium">Intermediate</span><span>10 questions</span></div>
            </div><div class="module-arrow">→</div>
        </div>
        <div class="module-card" onclick="window.location.href='/quiz?cat=data'">
            <div class="module-icon">🗄️</div>
            <div class="module-info">
                <h3>Data Protection</h3>
                <p>Handling sensitive company and customer data</p>
                <div class="module-meta"><span class="difficulty hard">Advanced</span><span>15 questions</span></div>
            </div><div class="module-arrow">→</div>
        </div>
        <div class="module-card" onclick="window.location.href='/quiz?cat=incident'">
            <div class="module-icon">🚨</div>
            <div class="module-info">
                <h3>Incident Response</h3>
                <p>What to do when a security incident occurs</p>
                <div class="module-meta"><span class="difficulty hard">Advanced</span><span>12 questions</span></div>
            </div><div class="module-arrow">→</div>
        </div>
    `;

    if (isPremium) {
        grid.innerHTML = freeModules + premiumModules;
    } else {
        grid.innerHTML = freeModules +
            lockModule('Device Security', '💻') +
            lockModule('Data Protection', '🗄️') +
            lockModule('Incident Response', '🚨');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

loadStats();
loadRecommendations();
renderModules();