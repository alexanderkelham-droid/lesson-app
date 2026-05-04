// Vercel serverless function — wraps the Express app and exports it
// so that any /api/* request is handled by Express routing.
module.exports = require('../server/src/app');
