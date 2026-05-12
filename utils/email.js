function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendResendEmail(to, name, subject, html) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
            from: `ShieldIQ <${process.env.EMAIL_FROM}>`,
            to: [to],
            subject,
            html
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend error ${res.status}: ${err}`);
    }
}

async function sendVerificationEmail(to, name, otp) {
    await sendResendEmail(to, name, 'Verify your ShieldIQ account', `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0A0A0F;color:#fff;border-radius:16px">
            <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
            <h2>Welcome, ${name}!</h2>
            <p style="color:#999">Your verification code is:</p>
            <div style="background:#111;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00D4FF">${otp}</span>
            </div>
            <p style="color:#999">Expires in <strong style="color:#fff">10 minutes</strong>.</p>
            <p style="color:#666;font-size:12px">If you didn't create a ShieldIQ account, ignore this email.</p>
        </div>
    `);
}

async function sendOTPEmail(to, name, otp, purpose = 'login') {
    const subjects = {
        login: 'Your ShieldIQ login code',
        reset: 'Reset your ShieldIQ password'
    };
    await sendResendEmail(to, name, subjects[purpose] || 'Your ShieldIQ code', `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0A0A0F;color:#fff;border-radius:16px">
            <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
            <h2>Hi ${name},</h2>
            <p style="color:#999">Your ${purpose === 'reset' ? 'password reset' : 'login'} code is:</p>
            <div style="background:#111;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00D4FF">${otp}</span>
            </div>
            <p style="color:#999">Expires in <strong style="color:#fff">10 minutes</strong>.</p>
            <p style="color:#666;font-size:12px">If you didn't request this, secure your account immediately.</p>
        </div>
    `);
}

module.exports = { generateOTP, sendVerificationEmail, sendOTPEmail };