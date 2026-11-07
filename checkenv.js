require('dotenv').config();
console.log('CLIENT_ID set:', Boolean(process.env.PAYPAL_CLIENT_ID));
console.log('SECRET set:', Boolean(process.env.PAYPAL_CLIENT_SECRET));
console.log('ENV:', process.env.PAYPAL_ENV);
