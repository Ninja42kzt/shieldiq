// Edit prices here. appPlan = the value stored in users.plan.
// Individual tiers mirror the company tiers feature-for-feature (minus leaderboard,
// which individuals never get at all, and minus "remind", which is an admin-dashboard-only
// action individuals never see since they have no admin.html access).
module.exports = {
    currency: 'USD',
    plans: {
        business:        { name: 'ShieldIQ Business',        usd: '5.00', appPlan: 'business',        maxSeats: 10 },
        enterprise:      { name: 'ShieldIQ Enterprise',       usd: '8.00', appPlan: 'enterprise',      maxSeats: 30 },
        individual:      { name: 'ShieldIQ Individual',       usd: '3.00', appPlan: 'individual',      maxSeats: 1 },
        individual_pro:  { name: 'ShieldIQ Individual Pro',   usd: '6.00', appPlan: 'individual_pro',  maxSeats: 1 },
    },
    // For M-Pesa later (KES). Fill in when you've decided.
    kes: { business: null, enterprise: null, individual: null, individual_pro: null },
};
