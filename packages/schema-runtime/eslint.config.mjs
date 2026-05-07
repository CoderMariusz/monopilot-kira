// packages/schema-runtime/eslint.config.mjs
// ESLint v9 flat config for @monopilot/schema-runtime.
// Extends the shared workspace base; no package-specific overrides needed.
// NOTE: the historical hardcoded Reference.DeptColumns / Reference.FieldTypes literals
// in src/compile.ts have already been replaced with RefTables enum references (RED notes).
import base from '../../tooling/eslint/base.mjs';

export default [...base];
