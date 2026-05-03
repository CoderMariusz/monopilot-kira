import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable must be set before running migrate');
}

const result = spawnSync('drizzle-kit', ['push'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
});

if (result.error) {
  throw result.error;
}

if (result.status === null || result.status !== 0) {
  process.exit(result.status ?? 1);
}
