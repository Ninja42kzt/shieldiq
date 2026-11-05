// Edit prices here. appPlan = the value stored in users.plan.
module.exports = {
    currency: 'USD',
    plans: {
        business:   { name: 'ShieldIQ Business',   usd: '0.60',  appPlan: 'business',   maxSeats: 10 },
        enterprise: { name: 'ShieldIQ Enterprise', usd: '15.00', appPlan: 'enterprise', maxSeats: 30 },
    },
    // For M-Pesa later (KES). Fill in when you've decided.
    kes: { business: null, enterprise: null },
};
