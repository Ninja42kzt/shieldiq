function togglePass() {
    const pass = document.getElementById('password');
    pass.type = pass.type === 'password' ? 'text' : 'password';
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');

    // Basic validation
    if (!email || !password) {
        errorMsg.textContent = 'Please fill in all fields';
        errorMsg.style.display = 'block';
        successMsg.style.display = 'none';
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            successMsg.textContent = 'Login successful! Redirecting...';
            successMsg.style.display = 'block';
            errorMsg.style.display = 'none';
            setTimeout(() => window.location.href = '/dashboard', 1500);
        } else {
            errorMsg.textContent = data.message || 'Invalid credentials';
            errorMsg.style.display = 'block';
            successMsg.style.display = 'none';
        }
    } catch (err) {
        errorMsg.textContent = 'Server error. Please try again.';
        errorMsg.style.display = 'block';
    }
}
async function handleRegister() {
    const name = document.getElementById('name').value;
    const company = document.getElementById('company').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');

    // Validation
    if (!name || !company || !email || !password || !confirmPassword) {
        errorMsg.textContent = 'Please fill in all fields';
        errorMsg.style.display = 'block';
        successMsg.style.display = 'none';
        return;
    }

    if (password !== confirmPassword) {
        errorMsg.textContent = 'Passwords do not match';
        errorMsg.style.display = 'block';
        successMsg.style.display = 'none';
        return;
    }

    if (password.length < 8) {
        errorMsg.textContent = 'Password must be at least 8 characters';
        errorMsg.style.display = 'block';
        successMsg.style.display = 'none';
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, company, email, password })
        });

        const data = await response.json();
if (response.ok) {
    successMsg.textContent = 'Account created! Redirecting to login...';
    successMsg.style.display = 'block';
    errorMsg.style.display = 'none';
    setTimeout(() => window.location.href = '/login', 1500);

        } else {
            errorMsg.textContent = data.message || 'Registration failed';
            errorMsg.style.display = 'block';
            successMsg.style.display = 'none';
        }
    } catch (err) {
        errorMsg.textContent = 'Server error. Please try again.';
        errorMsg.style.display = 'block';
    }
}