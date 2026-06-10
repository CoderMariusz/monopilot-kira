// packages/rate-limit/eslint.config.mjs
// ESLint v9 flat config for @monopilot/rate-limit.
// Extends the shared workspace base (T-055) — the previous standalone config ran
// bare js.configs.recommended, whose `no-unused-vars` false-positives on TS
// interface method signatures kept repo-wide `pnpm lint` red.
import base from '../../tooling/eslint/base.mjs';

export default [...base];
