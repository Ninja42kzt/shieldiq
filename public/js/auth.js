function togglePass() {
    const pass = document.getElementById('password');
    pass.type = pass.type === 'password' ? 'text' : 'password';
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');

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

        if (response.ok && data.requiresMFA) {
            // Show MFA input
            successMsg.textContent = data.message;
            successMsg.style.display = 'block';
            errorMsg.style.display = 'none';
            showMFAInput(email, password);
            return;
        }

        if (response.ok && data.token) {
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

function showMFAInput(email, password) {
    const form = document.querySelector('.auth-form');
    form.innerHTML += `
        <div class="form-group" id="mfa-group">
            <label>Enter the 6-digit code sent to your email</label>
            <input type="text" id="mfa-code" placeholder="000000" maxlength="6" style="letter-spacing:8px; text-align:center; font-size:24px; font-weight:700"/>
        </div>
        <button class="btn-primary full" onclick="verifyMFA('${email}', '${password}')">
            Verify Code →
        </button>
    `;
}

async function verifyMFA(email, password) {
    const otp = document.getElementById('mfa-code').value;
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, otp })
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            successMsg.textContent = 'Login successful! Redirecting...';
            successMsg.style.display = 'block';
            errorMsg.style.display = 'none';
            setTimeout(() => window.location.href = '/dashboard', 1500);
        } else {
            errorMsg.textContent = data.message || 'Invalid code';
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

        if (response.ok && data.requiresVerification) {
            successMsg.textContent = data.message;
            successMsg.style.display = 'block';
            errorMsg.style.display = 'none';
            showVerificationInput(email);
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

function showVerificationInput(email) {
    const form = document.querySelector('.auth-form');
    form.innerHTML = `
        <div style="text-align:center; margin-bottom:24px">
            <div style="font-size:48px; margin-bottom:16px">📧</div>
            <h3 style="color:var(--text); margin-bottom:8px">Check your email</h3>
            <p style="color:var(--text-muted); font-size:14px">We sent a 6-digit code to <strong style="color:var(--primary)">${email}</strong></p>
        </div>
        <div class="form-group">
            <label>Verification Code</label>
            <input type="text" id="verify-code" placeholder="000000" maxlength="6" style="letter-spacing:8px; text-align:center; font-size:24px; font-weight:700"/>
        </div>
        <button class="btn-primary full" onclick="verifyEmail('${email}')">
            Verify Email →
        </button>
        <p class="auth-switch">Already verified? <a href="/login">Login here</a></p>
    `;
}

async function verifyEmail(email) {
    const otp = document.getElementById('verify-code').value;
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');

    try {
        const response = await fetch('/api/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });

        const data = await response.json();

        if (response.ok) {
            successMsg.textContent = 'Email verified! Redirecting to login...';
            successMsg.style.display = 'block';
            errorMsg.style.display = 'none';
            setTimeout(() => window.location.href = '/login', 1500);
        } else {
            errorMsg.textContent = data.message || 'Invalid code';
            errorMsg.style.display = 'block';
            successMsg.style.display = 'none';
        }
    } catch (err) {
        errorMsg.textContent = 'Server error. Please try again.';
        errorMsg.style.display = 'block';
    }
}