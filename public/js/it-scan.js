const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const userData = JSON.parse(localStorage.getItem('user') || '{}');
const ENTERPRISE_PLANS = ['enterprise', 'enterprise_trial'];

if (userData.name) {
    document.getElementById('user-name').textContent = userData.name;
    document.getElementById('user-company').textContent = userData.company || 'Company';
    document.getElementById('user-avatar').textContent = userData.name[0].toUpperCase();
}

const isIT = (userData.department || '').toLowerCase() === 'it';
const isEnterprise = ENTERPRISE_PLANS.includes(userData.plan);

function showGate(id) {
    ['cg-locked', 'cg-upgrade', 'cg-content'].forEach(el => {
        document.getElementById(el).style.display = el === id ? 'block' : 'none';
    });
}

if (!isIT) {
    showGate('cg-locked');
} else if (!isEnterprise) {
    showGate('cg-upgrade');
} else {
    showGate('cg-content');
    loadScans();
}

async function startScan() {
    const repoUrl = document.getElementById('repo-url').value.trim();
    const branch = document.getElementById('repo-branch').value.trim() || 'main';
    const msg = document.getElementById('scan-msg');
    if (!repoUrl) { msg.textContent = 'Enter a repository URL first.'; return; }

    msg.textContent = 'Starting scan...';
    try {
        const res = await fetch('/api/it/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ repoUrl, branch })
        });
        const data = await res.json();
        if (!res.ok) {
            msg.textContent = data.message || 'Failed to start scan';
            return;
        }
        msg.textContent = `Scan #${data.scanId} started — this can take a few minutes.`;
        setTimeout(loadScans, 1500);
    } catch (e) {
        msg.textContent = 'Server error. Please try again.';
    }
}

function statusBadge(status) {
    return `<span class="scan-status status-${status}">${status}</span>`;
}

async function loadScans() {
    const rows = document.getElementById('scan-rows');
    try {
        const res = await fetch('/api/it/scans', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            rows.innerHTML = `<tr><td colspan="6" style="padding:16px;color:var(--text-muted)">Couldn't load scans.</td></tr>`;
            return;
        }
        const data = await res.json();
        const scans = data.scans || [];
        if (scans.length === 0) {
            rows.innerHTML = `<tr><td colspan="6" style="padding:16px;color:var(--text-muted)">No scans yet — run your first one above.</td></tr>`;
            return;
        }
        rows.innerHTML = scans.map(s => `
            <tr class="employee-row">
                <td>${s.repo_url}</td>
                <td>${s.branch}</td>
                <td>${statusBadge(s.status)}</td>
                <td>${s.risk_score ?? '—'}</td>
                <td>${new Date(s.created_at).toLocaleString()}</td>
                <td><button class="remind-btn" onclick="viewScan(${s.id})">View</button></td>
            </tr>
        `).join('');
    } catch (e) {
        rows.innerHTML = `<tr><td colspan="6" style="padding:16px;color:var(--text-muted)">Couldn't load scans.</td></tr>`;
    }
}

async function viewScan(id) {
    const res = await fetch(`/api/it/scans/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) { alert(data.message || 'Failed to load scan'); return; }

    const scan = data.scan;
    const summary = typeof scan.summary === 'string' ? JSON.parse(scan.summary) : scan.summary;
    const vulns = typeof scan.vulnerabilities === 'string' ? JSON.parse(scan.vulnerabilities) : (scan.vulnerabilities || []);

    document.getElementById('scan-detail').style.display = 'block';
    document.getElementById('detail-title').textContent = `Scan detail — ${scan.repo_url}`;
    document.getElementById('detail-summary').innerHTML = summary ? `
        <div style="display:flex;gap:24px;flex-wrap:wrap">
            <div><strong>Risk score:</strong> ${scan.risk_score ?? '—'}</div>
            <div><strong>Critical:</strong> ${summary.critical ?? 0}</div>
            <div><strong>High:</strong> ${summary.high ?? 0}</div>
            <div><strong>Medium:</strong> ${summary.medium ?? 0}</div>
            <div><strong>Low:</strong> ${summary.low ?? 0}</div>
        </div>` : '<p style="color:var(--text-muted)">Scan still running or no summary yet.</p>';

    const vulnsEl = document.getElementById('detail-vulns');
    if (!vulns.length) {
        vulnsEl.innerHTML = '<p style="color:var(--text-muted)">No vulnerability detail available.</p>';
    } else {
        vulnsEl.innerHTML = vulns.map(v => `
            <div class="vuln-item">
                <span class="sev sev-${v.severity}">${v.severity}</span>
                <strong>${v.title || v.type || 'Issue'}</strong>
                <div style="font-size:13px;color:var(--text-muted);margin-top:6px">${v.description || ''}</div>
                ${v.file ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">📄 ${v.file}${v.line ? ':' + v.line : ''}</div>` : ''}
            </div>
        `).join('');
    }
    document.getElementById('scan-detail').scrollIntoView({ behavior: 'smooth' });
}

function toggleSidebar() { document.querySelector('.sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('show'); }
function closeSidebar() { document.querySelector('.sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('show'); }
function logout() { localStorage.clear(); window.location.href = '/login'; }
