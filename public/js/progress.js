const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const userData = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('user-name').textContent = userData.name || 'User';
document.getElementById('user-company').textContent = userData.company || 'Company';
document.getElementById('user-avatar').textContent = (userData.name || 'U')[0].toUpperCase();

const categories = {
    phishing: { title: 'Phishing Awareness', icon: '🎣' },
    passwords: { title: 'Password Security', icon: '🔑' },
    social: { title: 'Social Engineering', icon: '🧠' },
    devices: { title: 'Device Security', icon: '💻' },
    data: { title: 'Data Protection', icon: '🗄️' },
    incident: { title: 'Incident Response', icon: '🚨' }
};

async function loadProgress() {
    try {
        const response = await fetch('/api/quiz/results', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const results = await response.json();

        if (results.length === 0) {
            renderEmptyCategories();
            return;
        }

        // Calculate stats
        const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
        const bestScore = Math.max(...results.map(r => r.score));
        let riskLevel = avgScore >= 80 ? 'Low' : avgScore >= 60 ? 'Medium' : 'High';

        document.getElementById('total-modules').textContent = results.length;
        document.getElementById('avg-score').textContent = avgScore + '%';
        document.getElementById('best-score').textContent = bestScore + '%';
        document.getElementById('risk-level').textContent = riskLevel;

        // Category breakdown
        renderCategories(results);

        // Recent activity
        renderActivity(results);

    } catch (err) {
        console.error('Error loading progress:', err);
    }
}

function renderCategories(results) {
    const grid = document.getElementById('category-grid');
    grid.innerHTML = '';

    Object.entries(categories).forEach(([key, cat]) => {
        const catResults = results.filter(r => r.category === key);
        const done = catResults.length > 0;
        const score = done ? catResults[catResults.length - 1].score : 0;
        const color = score >= 80 ? '#34c759' : score >= 60 ? '#ff9f0a' : '#ff6b6b';

        grid.innerHTML += `
            <div class="category-card ${!done ? 'not-started' : ''}">
                <div class="category-header">
                    <div class="category-title">
                        <span>${cat.icon}</span>
                        <span>${cat.title}</span>
                    </div>
                    <span class="category-score">${done ? score + '%' : 'Not started'}</span>
                </div>
                <div class="category-bar">
                    <div class="category-bar-fill" style="width:${score}%; background:${color}"></div>
                </div>
                <div class="category-meta">
                    ${done ? `Completed ${catResults.length} time${catResults.length > 1 ? 's' : ''}` : 'Click Training to start'}
                </div>
            </div>
        `;
    });
}

function renderEmptyCategories() {
    const grid = document.getElementById('category-grid');
    grid.innerHTML = '';
    Object.entries(categories).forEach(([key, cat]) => {
        grid.innerHTML += `
            <div class="category-card not-started">
                <div class="category-header">
                    <div class="category-title">
                        <span>${cat.icon}</span>
                        <span>${cat.title}</span>
                    </div>
                    <span class="category-score">Not started</span>
                </div>
                <div class="category-bar">
                    <div class="category-bar-fill" style="width:0%"></div>
                </div>
                <div class="category-meta">Click Training to start</div>
            </div>
        `;
    });
}

function renderActivity(results) {
    const list = document.getElementById('activity-list');
    if (results.length === 0) return;

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