// tooling/eslint-rules/index.mjs
// ESLint v9 flat-config plugin: @monopilot/eslint-rules.
//
// Usage in a flat config:
//   import monopilotRules from '@monopilot/eslint-rules';
//   export default [
//     {
//       files: ['src/permissions.enum.ts'],
//       plugins: { '@monopilot/eslint-rules': monopilotRules },
//       rules: { '@monopilot/eslint-rules/no-direct-permissions-enum-edit': 'error' },
//     },
//   ];
import noDirectPermissionsEnumEdit from './rules/no-direct-permissions-enum-edit.mjs';

const plugin = {
  meta: {
    name: '@monopilot/eslint-rules',
    version: '0.0.0',
  },
  rules: {
    'no-direct-permissions-enum-edit': noDirectPermissionsEnumEdit,
  },
};

export default plugin;
export { noDirectPermissionsEnumEdit };
