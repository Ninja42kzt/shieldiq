// Check auth
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login';
}

// Decode token to get user info
function parseJWT(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}

const user = parseJWT(token);

if (user) {
    // Get full user details from token stored at login
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    
    document.getElementById('welcome-name').textContent = userData.name || 'User';
    document.getElementById('user-name').textContent = userData.name || 'User';
    document.getElementById('user-company').textContent = userData.company || 'Company';
    document.getElementById('user-avatar').textContent = (userData.name || 'U')[0].toUpperCase();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}