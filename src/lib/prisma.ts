// =============================================================================
// src/lib/prisma.ts
// Prisma Client singleton — safe for Next.js hot-reload in development.
//
// Next.js module hot-reload creates a new module scope on every file save,
// which would instantiate a new PrismaClient on each reload and rapidly
// exhaust the PostgreSQL connection pool. The global singleton pattern below
// pins a single instance to the Node.js global object, which persists across
// hot-reloads in development while still being garbage-collected on process exit.
//
// In production (NODE_ENV === "production") module caching is permanent, so
// we skip the global indirection and export a plain module-level singleton.
// =============================================================================

import { PrismaClient } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

// Extend the Node.js global type to hold our singleton reference.
// This declaration merges into the existing NodeJS.Global interface.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],

    errorFormat: process.env.NODE_ENV === "production" ? "minimal" : "pretty",
  });
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const prisma: PrismaClient =
  process.env.NODE_ENV === "production"
    ? createPrismaClient()
    : (globalThis.__prisma ?? (globalThis.__prisma = createPrismaClient()));

export { prisma };