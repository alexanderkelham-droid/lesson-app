// Shared Prisma Client instance.
//
// Why a singleton: in a serverless environment (Vercel), every function
// invocation is a fresh module load if cold-start, or a reuse of an existing
// container if warm. If each route file does `new PrismaClient()`, we open a
// new connection pool per cold start AND per route module — quickly exhausting
// the database's connection limit. Caching the client on `globalThis` lets
// warm containers reuse the same client across invocations and keeps every
// route on the same pool.
//
// In dev with hot-reload (nodemon), the same trick prevents Prisma from
// spamming the DB with new clients on each file change.

const { PrismaClient } = require('@prisma/client');

const prisma = globalThis.__prisma__ || new PrismaClient();

// Cache in all environments (serverless containers persist between requests
// while warm; caching in dev avoids HMR connection storms).
globalThis.__prisma__ = prisma;

module.exports = prisma;
