/**
 * @monopilot/schema-runtime — public API
 *
 * Production exports: compile, clearCache
 * Test seams (underscore prefix = test-only by convention):
 *   _setPool, _clearPool — inject / clear a pg.Pool and schema name for tests.
 *   These are genuine exports so that test suites can call them explicitly in
 *   beforeAll / afterAll without relying on env-var detection (process.env.VITEST).
 */
export { compile, clearCache, _setPool, _clearPool } from './compile.js';
export { buildDeptZod, clearDeptZodCache } from './build-dept-zod.js';
