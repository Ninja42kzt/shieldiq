// PayPal Subscriptions (REST). Uses Node's built-in fetch (Node 18+).
const { db } = require('../db');
const { plans, currency } = require('../config/plans');

const BASE = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const SITE = process.env.SITE_URL || 'https://shieldiq.glitchfactory.co.ke';

let tok = { value: null, exp: 0 };
async function accessToken() {
    if (tok.value && Date.now() < tok.exp) return tok.value;
    const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const r = await fetch(`${BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`PayPal auth failed: ${j.error_description || r.status}`);
    tok = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
    return tok.value;
}

async function api(method, path, body, extraHeaders = {}) {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...extraHeaders },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    const j = text ? JSON.parse(text) : {};
    if (!r.ok) throw new Error(`PayPal ${method} ${path} -> ${r.status}: ${j.message || text.slice(0, 200)}`);
    return j;
}

async function ensureTables() {
    await db.executeMultiple(`
        CREATE TABLE IF NOT EXISTS paypal_plans (plan_key TEXT PRIMARY KEY, product_id TEXT, plan_id TEXT NOT NULL, price TEXT);
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, provider TEXT NOT NULL,
            provider_sub_id TEXT UNIQUE NOT NULL, plan_key TEXT NOT NULL, status TEXT NOT NULL,
            seats INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, provider TEXT NOT NULL, provider_payment_id TEXT UNIQUE NOT NULL,
            provider_sub_id TEXT, amount TEXT, currency TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, received_at TEXT DEFAULT CURRENT_TIMESTAMP);
    `);
}

// Creates the PayPal product + plan once per tier and remembers the IDs.
// If you change a price in config/plans.js, delete that row from paypal_plans so a new plan is made.
async function ensurePlan(planKey) {
    await ensureTables();
    const cfg = plans[planKey];
    if (!cfg) throw new Error('Unknown plan');
    const row = (await db.execute({ sql: 'SELECT plan_id FROM paypal_plans WHERE plan_key = ?', args: [planKey] })).rows[0];
    if (row) return row.plan_id;

    const product = await api('POST', '/v1/catalogs/products',
        { name: cfg.name, type: 'SERVICE', category: 'SOFTWARE' }, { 'PayPal-Request-Id': `shieldiq-product-${planKey}-${cfg.usd}` });
    const plan = await api('POST', '/v1/billing/plans', {
        product_id: product.id,
        name: `${cfg.name} (monthly, per user)`,
        status: 'ACTIVE',
        billing_cycles: [{
            frequency: { interval_unit: 'MONTH', interval_count: 1 },
            tenure_type: 'REGULAR', sequence: 1, total_cycles: 0,
            pricing_scheme: { fixed_price: { value: cfg.usd, currency_code: currency } },
        }],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
        quantity_supported: true,
    }, { 'PayPal-Request-Id': `shieldiq-plan-${planKey}-${cfg.usd}` });

    await db.execute({
        sql: 'INSERT OR REPLACE INTO paypal_plans (plan_key, product_id, plan_id, price) VALUES (?, ?, ?, ?)',
        args: [planKey, product.id, plan.id, cfg.usd],
    });
    return plan.id;
}

// startTime (Date) = when the first charge happens. Used so a user still in their free trial is
// approved now but charged only when the trial ends (card/PayPal on file, nothing taken until then).
async function createSubscription({ planKey, seats, user, startTime, returnUrl, cancelUrl, paypalEmail }) {
    const planId = await ensurePlan(planKey);
    const body = {
        plan_id: planId,
        quantity: String(seats),
        custom_id: String(user.id),
        subscriber: { name: { given_name: String(user.name || 'ShieldIQ').split(' ')[0] }, email_address: paypalEmail || user.email },
        application_context: {
            brand_name: 'ShieldIQ', user_action: 'SUBSCRIBE_NOW', shipping_preference: 'NO_SHIPPING',
            return_url: returnUrl || `${SITE}/billing?status=success`,
            cancel_url: cancelUrl || `${SITE}/billing?status=cancelled`,
        },
    };
    if (startTime) body.start_time = startTime.toISOString();
    const sub = await api('POST', '/v1/billing/subscriptions', body);
    const approve = (sub.links || []).find(l => l.rel === 'approve');
    if (!approve) throw new Error('PayPal did not return an approval link');
    return { id: sub.id, approveUrl: approve.href };
}

// rawBody must be the exact bytes PayPal sent (a string), spliced in untouched.
async function verifyWebhook(headers, rawBody) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID not set');
    const h = n => headers[n];
    const payload = `{"auth_algo":${JSON.stringify(h('paypal-auth-algo'))},"cert_url":${JSON.stringify(h('paypal-cert-url'))},` +
        `"transmission_id":${JSON.stringify(h('paypal-transmission-id'))},"transmission_sig":${JSON.stringify(h('paypal-transmission-sig'))},` +
        `"transmission_time":${JSON.stringify(h('paypal-transmission-time'))},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${rawBody}}`;
    const r = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
        body: payload,
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.verification_status === 'SUCCESS';
}

module.exports = { ensureTables, ensurePlan, createSubscription, verifyWebhook };
