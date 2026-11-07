// nav.js -- shared sidebar logic for every authenticated page. Loaded as a plain <script src>
// (not a module), so it's wrapped in its own IIFE to avoid colliding with each page's existing
// top-level `const token` / `const userData` declarations.
//
// Single source of truth for CodeGuard's nav visibility, since this rule previously lived
// separately in dashboard.js and admin.js and had drifted into two different (both wrong)
// versions. Per pricing: Individual Pro gets CodeGuard for everyone on that plan (a solo account
// has no real department); Enterprise gets it only for IT-department employees (pricing literally
// says "CodeGuard code security scanning (IT department)" for that tier); Business/Free never do.
(function () {
    const token = localStorage.getItem('token');
    if (!token) return; // each page's own script already handles the redirect-to-login case

    function hasCodeGuard(plan, department) {
        return (plan === 'individual_pro' || plan === 'individual_pro_trial')
            || ((plan === 'enterprise' || plan === 'enterprise_trial') && (department || '').toLowerCase() === 'it');
    }

    function render() {
        const cgNav = document.getElementById('nav-codeguard');
        if (!cgNav) return;
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        cgNav.style.display = hasCodeGuard(userData.plan || 'free', userData.department) ? 'flex' : 'none';
    }
    render();

    // Company admins: every page gets an "Admin Panel" link, and "Dashboard" links carry ?from=admin
    // so dashboard.js doesn't bounce them straight back to /admin (that bounce is what made the
    // admin panel appear to vanish and reappear).
    (function setupAdminNav() {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        if (u.role !== 'admin' || !u.company) return;
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;
        nav.querySelectorAll('a[href="/dashboard"]').forEach(function (a) { a.setAttribute('href', '/dashboard?from=admin'); });
        if (!nav.querySelector('a[href="/admin"]')) {
            const a = document.createElement('a');
            a.href = '/admin';
            a.className = 'nav-item';
            a.innerHTML = '<span>\uD83D\uDD27</span> Admin Panel';
            nav.insertBefore(a, nav.firstChild);
        }
    })();

    // Catch a plan change made mid-session (trial/subscribe/cancel) without needing a fresh login.
    async function refresh() {
        try {
            const res = await fetch('/api/billing/status', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const data = await res.json();
            const userData = JSON.parse(localStorage.getItem('user') || '{}');
            if (data.plan && data.plan !== userData.plan) {
                userData.plan = data.plan;
                localStorage.setItem('user', JSON.stringify(userData));
            }
            render();
        } catch (e) { console.error('nav.js: could not refresh plan', e); }
    }
    refresh();
})();
