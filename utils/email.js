const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_ADDRESS = 'ShieldIQ <noreply@glitchfactory.co.ke>';

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(to, name, otp) {
    const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: 'Verify your ShieldIQ account',
        html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0A0A0F;color:#fff;border-radius:16px">
            <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
            <h2>Welcome, ${name}!</h2>
            <p style="color:#999">Your verification code is:</p>
            <div style="background:#111;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00D4FF">${otp}</span>
            </div>
            <p style="color:#999">Expires in <strong style="color:#fff">10 minutes</strong>.</p>
            <p style="color:#666;font-size:12px">If you didn't create a ShieldIQ account, ignore this email.</p>
        </div>`
    });

    if (error) {
        throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
    }
}

async function sendOTPEmail(to, name, otp, purpose = 'login') {
    const subjects = {
        login: 'Your ShieldIQ login code',
        reset: 'Reset your ShieldIQ password'
    };

    const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: subjects[purpose] || 'Your ShieldIQ code',
        html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0A0A0F;color:#fff;border-radius:16px">
            <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
            <h2>Hi ${name},</h2>
            <p style="color:#999">Your ${purpose === 'reset' ? 'password reset' : 'login'} code is:</p>
            <div style="background:#111;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00D4FF">${otp}</span>
            </div>
            <p style="color:#999">Expires in <strong style="color:#fff">10 minutes</strong>.</p>
            <p style="color:#666;font-size:12px">If you didn't request this, secure your account immediately.</p>
        </div>`
    });

    if (error) {
        throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
    }
}

// Admin "remind" button: sent from ShieldIQ's own verified address (Resend requires
// a verified sending domain, so we can't send as the admin's actual mailbox), but
// reply-to is set to the admin's email so a reply from the employee reaches the
// admin directly, and the admin's name/email is shown in the body too.
async function sendReminderEmail(to, toName, adminName, adminEmail, companyName) {
    const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        replyTo: adminEmail,
        subject: `Reminder: complete your ShieldIQ training${companyName ? ` — ${companyName}` : ''}`,
        html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0A0A0F;color:#fff;border-radius:16px">
            <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
            <h2>Hi ${toName},</h2>
            <p style="color:#999">
                ${adminName} (<a href="mailto:${adminEmail}" style="color:#00D4FF">${adminEmail}</a>)
                wanted to remind you to finish your security awareness training.
            </p>
            <div style="background:#111;border:1px solid #333;border-radius:12px;padding:20px;margin:24px 0">
                <p style="margin:0;color:#ccc">Log in and pick up where you left off — it only takes a few minutes per module.</p>
            </div>
            <p style="color:#666;font-size:12px">Replying to this email will reach ${adminName} directly.</p>
        </div>`
    });

    if (error) {
        throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
    }
}

module.exports = { generateOTP, sendVerificationEmail, sendOTPEmail, sendReminderEmail };
