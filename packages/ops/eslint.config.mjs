// packages/ops/eslint.config.mjs
// Flat config; defers to workspace base (T-055).
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,
];
