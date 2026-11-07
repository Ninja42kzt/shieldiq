// nav.js -- shared sidebar for every authenticated page. Loaded as a plain <script src>
// (not a module), so it's wrapped in its own IIFE to avoid colliding with each page's existing
// top-level `const token` / `const userData` declarations.
//
// Single source of truth for the sidebar: every page used to hard-code its own list, which is why the
// links, labels and plan badge differed from page to page. The markup in each HTML file is now only a
// no-JS fallback; this script replaces it with one consistent menu.
//
// CodeGuard rule (pricing): Individual Pro gets it for everyone on that plan (a solo account has no real
// department); Enterprise gets it only for IT-department employees; Business/Free never do.
(function () {
    const token = localStorage.getItem('token');
    if (!token) return; // each page's own script already handles the redirect-to-login case

    const BADGES = {
        free: ['Free', '#666'],
        business_trial: ['Business Trial', '#00D4FF'], business: ['Business', '#00D4FF'],
        enterprise_trial: ['Enterprise Trial', '#bf5af2'], enterprise: ['Enterprise', '#bf5af2'],
        individual_trial: ['Individual Trial', '#00D4FF'], individual: ['Individual', '#00D4FF'],
        individual_pro_trial: ['Pro Trial', '#bf5af2'], individual_pro: ['Individual Pro', '#bf5af2']
    };

    function getUser() {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch (e) { return {}; }
    }

    function hasCodeGuard(plan, department) {
        return (plan === 'individual_pro' || plan === 'individual_pro_trial')
            || ((plan === 'enterprise' || plan === 'enterprise_trial') && (department || '').toLowerCase() === 'it');
    }

    // Which menu item is "current" for this URL.
    function activeKey() {
        const p = location.pathname.replace(/\/+$/, '') || '/';
        if (p === '/admin') return 'admin';
        if (p === '/dashboard') return 'dashboard';
        if (p === '/quiz' || p === '/training') return 'training';
        if (p === '/progress') return 'progress';
        if (p === '/leaderboard') return 'leaderboard';
        if (p === '/it-scan') return 'codeguard';
        if (p === '/settings') return 'settings';
        return '';
    }

    function buildNav() {
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;
        const u = getUser();
        const isCompanyAdmin = u.role === 'admin' && !!u.company;
        const items = [];
        if (isCompanyAdmin) items.push({ key: 'admin', href: '/admin', icon: '\uD83D\uDD27', label: 'Admin Panel' });
        // ?from=admin stops dashboard.js bouncing company admins straight back to /admin.
        items.push({ key: 'dashboard', href: isCompanyAdmin ? '/dashboard?from=admin' : '/dashboard', icon: '\uD83D\uDCCA', label: 'Dashboard' });
        items.push({ key: 'training', href: '/quiz', icon: '\uD83C\uDFAF', label: 'Training' });
        items.push({ key: 'progress', href: '/progress', icon: '\uD83D\uDCC8', label: 'My Progress' });
        if (u.company) items.push({ key: 'leaderboard', href: '/leaderboard', icon: '\uD83C\uDFC6', label: 'Leaderboard' });
        if (hasCodeGuard(u.plan || 'free', u.department)) items.push({ key: 'codeguard', href: '/it-scan', icon: '\uD83D\uDD0D', label: 'CodeGuard', id: 'nav-codeguard' });
        items.push({ key: 'settings', href: '/settings', icon: '\u2699\uFE0F', label: 'Settings' });

        const current = activeKey();
        nav.textContent = '';
        items.forEach(function (it) {
            const a = document.createElement('a');
            a.href = it.href;
            a.className = 'nav-item' + (it.key === current ? ' active' : '');
            if (it.id) a.id = it.id;
            const icon = document.createElement('span');
            icon.textContent = it.icon;
            a.appendChild(icon);
            a.appendChild(document.createTextNode(' ' + it.label));
            nav.appendChild(a);
        });
    }

    // Same plan badge under the name on every page (dashboard.js draws an identical one).
    function renderPlanBadge() {
        const el = document.getElementById('user-company');
        if (!el) return;
        const u = getUser();
        const b = BADGES[u.plan || 'free'] || BADGES.free;
        el.textContent = (u.company || '') + ' ';
        const span = document.createElement('span');
        span.textContent = b[0];
        span.style.cssText = 'background:' + b[1] + '22;color:' + b[1] + ';font-size:10px;padding:2px 6px;border-radius:4px;margin-left:4px';
        el.appendChild(span);
    }

    buildNav();
    // Page scripts set the company text after this file loads; re-apply the badge once they've run.
    setTimeout(renderPlanBadge, 0);

    // Catch a plan change made mid-session (trial/subscribe/cancel) without needing a fresh login.
    async function refresh() {
        try {
            const res = await fetch('/api/billing/status', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const data = await res.json();
            const userData = getUser();
            if (data.plan && data.plan !== userData.plan) {
                userData.plan = data.plan;
                localStorage.setItem('user', JSON.stringify(userData));
            }
            buildNav();
            renderPlanBadge();
        } catch (e) { console.error('nav.js: could not refresh plan', e); }
    }
    refresh();
})();
