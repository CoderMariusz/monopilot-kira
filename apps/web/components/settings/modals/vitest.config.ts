import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../../vitest.ui.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: '@radix-ui/react-dialog',
          replacement: path.resolve(__dirname, '../../../../../packages/ui/node_modules/@radix-ui/react-dialog'),
        },
      ],
    },
    test: {
      include: ['components/settings/modals/**/*.test.tsx'],
    },
  }),
);
