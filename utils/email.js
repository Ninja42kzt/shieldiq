const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    logger: true,  // Logs SMTP traffic to the console
    debug: true,   // Shows detailed error messages
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // MUST be a 16-character App Password
    },
    connectionTimeout: 10000, 
    tls: {
        rejectUnauthorized: false // Helps bypass certificate issues on hosting providers
    }
});

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(to, name, otp) {
    try {
        await transporter.sendMail({
            from: `"ShieldIQ" <${process.env.EMAIL_USER}>`,
            to,
            subject: 'Verify your ShieldIQ account',
            html: `
            <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:32px; background:#0A0A0F; color:#fff; border-radius:16px">
                <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
                <h2>Welcome, ${name}!</h2>
                <p style="color:#999">Your verification code is:</p>
                <div style="background:#111; border:1px solid #333; border-radius:12px; padding:24px; text-align:center; margin:24px 0">
                    <span style="font-size:40px; font-weight:800; letter-spacing:12px; color:#00D4FF">${otp}</span>
                </div>
                <p style="color:#999">This code expires in <strong style="color:#fff">10 minutes</strong>.</p>
            </div>
            `
        });
    } catch (error) {
        console.error('Email failed:', error);
        throw error;
    }
}

async function sendOTPEmail(to, name, otp, purpose = 'login') {
    const subjects = {
        login: 'Your ShieldIQ login code',
        reset: 'Reset your ShieldIQ password'
    };
    try {
        await transporter.sendMail({
            from: `"ShieldIQ" <${process.env.EMAIL_USER}>`,
            to,
            subject: subjects[purpose] || 'Your ShieldIQ code',
            html: `
            <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:32px; background:#0A0A0F; color:#fff; border-radius:16px">
                <h1 style="color:#00D4FF">🛡️ ShieldIQ</h1>
                <h2>Hi ${name},</h2>
                <div style="background:#111; border:1px solid #333; border-radius:12px; padding:24px; text-align:center; margin:24px 0">
                    <span style="font-size:40px; font-weight:800; letter-spacing:12px; color:#00D4FF">${otp}</span>
                </div>
            </div>
            `
        });
    } catch (error) {
        console.error('OTP Email failed:', error);
        throw error;
    }
}

module.exports = { generateOTP, sendVerificationEmail, sendOTPEmail };