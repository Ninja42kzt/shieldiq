const { createClient } = require('@libsql/client');

const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
});

module.exports = db;
