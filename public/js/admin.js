const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const userData = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('user-name').textContent = userData.name || 'Admin';
document.getElementById('user-company').textContent = userData.company || 'Company';
document.getElementById('user-avatar').textContent = (userData.name || 'A')[0].toUpperCase();

let allEmployees = [];

const moduleKeys = ['phishing', 'passwords', 'social', 'devices', 'data', 'incident'];

async function loadAdminData() {
    try {
        const res = await fetch('/api/admin/overview', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            document.querySelector('.main-content').innerHTML += `
                <div style="background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.3);border-radius:12px;padding:24px;margin-top:20px;text-align:center">
                    <div style="font-size:32px;margin-bottom:12px">🔒</div>
                    <h3 style="color:#ff6b6b;margin-bottom:8px">Admin Access Required</h3>
                    <p style="color:var(--text-muted);font-size:14px">You need admin privileges to view this dashboard. Contact your administrator.</p>
                </div>`;
            return;
        }

        allEmployees = data.employees || [];
        renderStats(data);
        renderEmployees(allEmployees);
        renderInsights(data);

    } catch (err) {
        console.error('Admin load error:', err);
        // Show demo data if API not ready
        loadDemoData();
    }
}

function loadDemoData() {
    const demo = {
        totalEmployees: 8,
        trainedCount: 5,
        companyAvg: 74,
        highRiskCount: 2,
        riskDistribution: { low: 3, medium: 2, high: 2, none: 1 },
        moduleCompletion: { phishing: 75, passwords: 62, social: 50, devices: 37, data: 25, incident: 12 },
        employees: [
            { name: 'Alice Kamau', email: 'alice@company.com', avg_score: 92, modules: 6, last_active: '2026-05-06', weak_areas: null },
            { name: 'Bob Ochieng', email: 'bob@company.com', avg_score: 78, modules: 4, last_active: '2026-05-05', weak_areas: 'Social Engineering' },
            { name: 'Carol Wanjiku', email: 'carol@company.com', avg_score: 45, modules: 2, last_active: '2026-05-03', weak_areas: 'Phishing, Data Protection' },
            { name: 'David Mutua', email: 'david@company.com', avg_score: 88, modules: 5, last_active: '2026-05-06', weak_areas: null },
            { name: 'Eve Akinyi', email: 'eve@company.com', avg_score: 35, modules: 1, last_active: '2026-04-28', weak_areas: 'Phishing, Passwords, Social Engineering' },
            { name: 'Frank Otieno', email: 'frank@company.com', avg_score: 72, modules: 3, last_active: '2026-05-04', weak_areas: 'Device Security' },
            { name: 'Grace Njeri', email: 'grace@company.com', avg_score: 95, modules: 6, last_active: '2026-05-06', weak_areas: null },
            { name: 'Henry Kipchoge', email: 'henry@company.com', avg_score: 0, modules: 0, last_active: null, weak_areas: null },
        ]
    };

    allEmployees = demo.employees;
    renderStats(demo);
    renderEmployees(demo.employees);
    renderInsights(demo);
}

function renderStats(data) {
    document.getElementById('total-employees').textContent = data.totalEmployees || 0;
    document.getElementById('trained-count').textContent = data.trainedCount || 0;
    document.getElementById('company-avg').textContent = (data.companyAvg || 0) + '%';
    document.getElementById('high-risk-count').textContent = data.highRiskCount || 0;

    // Risk bars
    const total = data.totalEmployees || 1;
    const dist = data.riskDistribution || {};
    ['low', 'medium', 'high', 'none'].forEach(level => {
        const count = dist[level] || 0;
        const pct = Math.round((count / total) * 100);
        document.getElementById(`${level}-bar`).style.width = pct + '%';
        document.getElementById(`${level}-count`).textContent = count;
    });

    // Module completion
    const comp = data.moduleCompletion || {};
    moduleKeys.forEach(key => {
        const pct = comp[key] || 0;
        const el = document.getElementById(`${key}-completion`);
        const pctEl = document.getElementById(`${key}-pct`);
        if (el) el.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
    });
}

function getRiskLevel(score, modules) {
    if (modules === 0) return 'none';
    if (score >= 80) return 'low';
    if (score >= 60) return 'medium';
    return 'high';
}

function renderEmployees(employees) {
    const tbody = document.getElementById('employee-tbody');

    if (!employees || employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:48px;text-align:center;color:var(--text-muted)">No employees found. Invite your team to get started.</td></tr>`;
        return;
    }

    tbody.innerHTML = employees.map(emp => {
        const risk = getRiskLevel(emp.avg_score || 0, emp.modules || 0);
        const riskLabels = { low: '🟢 Low', medium: '🟡 Medium', high: '🔴 High', none: '⚪ Not Started' };
        const riskClasses = { low: 'risk-low', medium: 'risk-medium', high: 'risk-high', none: 'risk-none' };
        const scoreColor = risk === 'low' ? '#34c759' : risk === 'medium' ? '#ff9f0a' : risk === 'high' ? '#ff6b6b' : 'var(--text-muted)';
        const lastActive = emp.last_active ? new Date(emp.last_active).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : 'Never';
        const weakAreas = emp.weak_areas ? emp.weak_areas.split(',').slice(0, 2).map(a => `<span style="background:rgba(255,159,10,0.1);color:#ff9f0a;padding:2px 6px;border-radius:4px;font-size:11px;margin-right:4px">${a.trim()}</span>`).join('') : '<span style="color:var(--text-muted);font-size:12px">None identified</span>';
        const initials = emp.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

        return `
            <tr class="employee-row" data-risk="${risk}" data-name="${emp.name.toLowerCase()}" data-email="${emp.email.toLowerCase()}">
                <td>
                    <div style="display:flex;align-items:center;gap:12px">
                        <div style="width:36px;height:36px;border-radius:50%;background:rgba(0,212,255,0.2);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${initials}</div>
                        <div>
                            <div style="font-weight:600">${emp.name}</div>
                            <div style="font-size:12px;color:var(--text-muted)">${emp.email}</div>
                        </div>
                    </div>
                </td>
                <td style="color:${scoreColor};font-weight:700;font-size:16px">${emp.avg_score || 0}%</td>
                <td>${emp.modules || 0} / 6</td>
                <td><span class="risk-badge ${riskClasses[risk]}">${riskLabels[risk]}</span></td>
                <td>${weakAreas}</td>
                <td style="color:var(--text-muted)">${lastActive}</td>
                <td>
                    <button class="remind-btn" onclick="sendReminder('${emp.email}', '${emp.name}')">
                        📧 Remind
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterEmployees() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const riskFilter = document.getElementById('risk-filter').value;
    const rows = document.querySelectorAll('#employee-tbody tr[data-risk]');

    rows.forEach(row => {
        const name = row.dataset.name || '';
        const email = row.dataset.email || '';
        const risk = row.dataset.risk || '';
        const matchSearch = name.includes(search) || email.includes(search);
        const matchRisk = riskFilter === 'all' || risk === riskFilter;
        row.style.display = matchSearch && matchRisk ? '' : 'none';
    });
}

function renderInsights(data) {
    const employees = data.employees || allEmployees;
    const sorted = [...employees].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));
    const topPerformer = sorted[0];
    const worstArea = getWorstModule(data.moduleCompletion || {});

    document.getElementById('top-performer').textContent = topPerformer
        ? `${topPerformer.name} — ${topPerformer.avg_score}% avg score across ${topPerformer.modules} modules`
        : 'No data yet';

    document.getElementById('top-vulnerability').textContent = worstArea
        ? `${worstArea} has the lowest completion rate. Focus training here first.`
        : 'Complete more modules for analysis';

    const highRisk = employees.filter(e => getRiskLevel(e.avg_score, e.modules) === 'high');
    document.getElementById('recommended-action').textContent = highRisk.length > 0
        ? `${highRisk.length} employee${highRisk.length > 1 ? 's' : ''} need immediate training. Send reminders to high-risk team members.`
        : employees.filter(e => e.modules === 0).length > 0
        ? `${employees.filter(e => e.modules === 0).length} employee${employees.filter(e => e.modules === 0).length > 1 ? 's' : ''} haven't started training yet.`
        : 'Great job! Your team is well trained. Keep up the momentum.';
}

function getWorstModule(completion) {
    const modules = { phishing: '🎣 Phishing', passwords: '🔑 Passwords', social: '🧠 Social Engineering', devices: '💻 Device Security', data: '🗄️ Data Protection', incident: '🚨 Incident Response' };
    let worst = null, worstPct = 101;
    Object.entries(completion).forEach(([key, pct]) => {
        if (pct < worstPct) { worstPct = pct; worst = modules[key]; }
    });
    return worst;
}

function sendReminder(email, name) {
    alert(`Reminder sent to ${name} (${email})!\n\nIn production this sends an email encouraging them to complete their training.`);
}

function exportReport() {
    const rows = [['Name', 'Email', 'Avg Score', 'Modules Completed', 'Risk Level', 'Last Active']];
    allEmployees.forEach(emp => {
        const risk = getRiskLevel(emp.avg_score || 0, emp.modules || 0);
        rows.push([emp.name, emp.email, (emp.avg_score || 0) + '%', emp.modules || 0, risk, emp.last_active || 'Never']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shieldiq-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

loadAdminData();
