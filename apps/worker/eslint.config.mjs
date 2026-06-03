// ESLint v9 flat config for @monopilot/worker.
// Worker owns exactly one shared pg.Pool in src/index.ts; job handlers receive it.
import base from '../../tooling/eslint/base.mjs';

export default [
  ...base,
  {
    files: ['src/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^Reference\\.[A-Z][A-Za-z]+$/]",
          message:
            "Do not hardcode Reference.* table-name strings. Import RefTables from '@monopilot/reference' instead.",
        },
      ],
    },
  },
];
