module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@radix-ui/react-dialog',
            message: 'Import Modal from @monopilot/ui/Modal instead. Direct Radix Dialog imports are only allowed in packages/ui.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['packages/ui/**/*.{js,jsx,ts,tsx}'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
