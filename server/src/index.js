// Local dev entrypoint — starts a long-running Express server.
// In production on Vercel, the serverless function at /api/index.js is used instead.
const app = require('./app');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
