const https = require('https');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendBrevoEmail(to, name, subject, html) {
    const data = JSON.stringify({
        sender: { name: 'ShieldIQ', email: 'shieldiq.noreply@gmail.com' },
        to: [{ email: to, name }],
        subject,
        htmlContent: html
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                } else {
                    reject(new Error(`Brevo error: ${res.statusCode} ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function sendVerificationEmail(to, name, otp) {
    await sendBrevoEmail(to, name, 'Verify your ShieldIQ account', `
        <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:32px; background:#0A0A0F; color:#fff; border-radius:16px">
            <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
            <h2>Welcome, ${name}!</h2>
            <p style="color:#999">Your verification code is:</p>
            <div style="background:#111; border:1px solid #333; border-radius:12px; padding:24px; text-align:center; margin:24px 0">
                <span style="font-size:40px; font-weight:800; letter-spacing:12px; color:#00D4FF">${otp}</span>
            </div>
            <p style="color:#999">This code expires in <strong style="color:#fff">10 minutes</strong>.</p>
            <p style="color:#666; font-size:12px">If you didn't create a ShieldIQ account, ignore this email.</p>
        </div>
    `);
}

async function sendOTPEmail(to, name, otp, purpose = 'login') {
    const subjects = {
        login: 'Your ShieldIQ login code',
        reset: 'Reset your ShieldIQ password'
    };
    await sendBrevoEmail(to, name, subjects[purpose] || 'Your ShieldIQ code', `
        <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:32px; background:#0A0A0F; color:#fff; border-radius:16px">
            <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
            <h2>Hi ${name},</h2>
            <p style="color:#999">Your ${purpose === 'reset' ? 'password reset' : 'login verification'} code is:</p>
            <div style="background:#111; border:1px solid #333; border-radius:12px; padding:24px; text-align:center; margin:24px 0">
                <span style="font-size:40px; font-weight:800; letter-spacing:12px; color:#00D4FF">${otp}</span>
            </div>
            <p style="color:#999">This code expires in <strong style="color:#fff">10 minutes</strong>.</p>
            <p style="color:#666; font-size:12px">If you didn't request this, please secure your account immediately.</p>
        </div>
    `);
}

module.exports = { generateOTP, sendVerificationEmail, sendOTPEmail };