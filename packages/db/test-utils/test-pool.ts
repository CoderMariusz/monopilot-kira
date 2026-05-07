/**
 * T-058 — test-utils/test-pool.ts
 *
 * Thin re-export surface for integration tests.
 *
 * - getOwnerConnection() → use only in beforeAll/afterAll DDL/setup (CREATE TABLE,
 *   GRANT, TRUNCATE).  Never use for assertion queries.
 * - getAppConnection()  → use for all runtime assertion queries (SELECT, INSERT
 *   under RLS, SET ROLE app_user blocks).
 *
 * Tests must NOT construct `new pg.Pool(...)` directly — the ESLint drift gate
 * (T-055 / T-058) enforces this once the eslint.config.mjs test-override is removed.
 */
export { getOwnerConnection, getAppConnection } from '../src/clients.js';
