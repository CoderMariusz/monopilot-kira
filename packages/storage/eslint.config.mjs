// packages/storage was the only package of 23 carrying a bespoke flat config.
// It kept the JS-level no-undef / no-unused-vars rules that the shared base
// deliberately turns off for TypeScript files, so `process.env` in a test helper
// read as "'process' is not defined". Because `pnpm -r lint` stops at the first
// failing package, that failure sat hidden behind the packages/rbac one and only
// surfaced once rbac was fixed. Aligned with the other 22 packages.
import base from '../../tooling/eslint/base.mjs';

export default [...base];
