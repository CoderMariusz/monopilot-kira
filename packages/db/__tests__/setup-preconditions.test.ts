import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')) as {
    scripts?: Record<string, string>;
  };
}

describe('db setup_dev preconditions', () => {
  it('documents a safe development DATABASE_URL placeholder', () => {
    const envExample = readFileSync(resolve(repoRoot, '.env.example'), 'utf8');

    expect(envExample).toContain('DATABASE_URL=');
    expect(envExample).toContain('localhost:5432/monopilot');
  });

  it('exposes root scripts for starting, testing, and migrating the dev database', () => {
    const packageJson = readJson('package.json');

    expect(packageJson.scripts).toMatchObject({
      'db:up': 'docker compose up -d postgres',
      'db:test': 'pnpm --filter @monopilot/db test',
      'db:migrate': 'pnpm --filter @monopilot/db migrate',
      'db:verify': 'pnpm db:test && pnpm db:migrate',
      'db:test:local': 'DATABASE_URL=postgres://monopilot:monopilot@127.0.0.1:5432/monopilot pnpm db:test',
      'db:migrate:local': 'DATABASE_URL=postgres://monopilot:monopilot@127.0.0.1:5432/monopilot pnpm db:migrate',
      'db:verify:local': 'DATABASE_URL=postgres://monopilot:monopilot@127.0.0.1:5432/monopilot pnpm db:verify',
    });
  });

  it('provides a Postgres 16 compose service for local verification', () => {
    const compose = readFileSync(resolve(repoRoot, 'docker-compose.yml'), 'utf8');

    expect(compose).toContain('postgres:16');
    expect(compose).toContain('5432:5432');
    expect(compose).toContain('POSTGRES_DB: monopilot');
  });
});
