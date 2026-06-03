import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { validateNewPassword } from '../password-policy';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(authRoot, '../..');
const dataFile = path.join(authRoot, 'data/common-passwords-25k.txt');
const fetcher = path.join(authRoot, 'scripts/fetch-nist-25k.ts');

const mockPool = {
  query: vi.fn().mockRejectedValue(new Error('password_history table unavailable')),
} as unknown as pg.Pool;

describe('bundled common passwords 25k list', () => {
  it('contains at least 24,000 unique normalized entries', async () => {
    const text = await readFile(dataFile, 'utf8');
    const entries = text.split('\n').filter(Boolean);

    expect(entries.length).toBeGreaterThanOrEqual(24_000);
    expect(new Set(entries).size).toBe(entries.length);
    expect(entries.every((entry) => entry === entry.toLowerCase())).toBe(true);
  });

  it('rejects password as too_common', async () => {
    const result = await validateNewPassword({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      orgId: '550e8400-e29b-41d4-a716-446655440099',
      newPassword: 'password',
      pool: mockPool,
      hibp: vi.fn().mockResolvedValue(''),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain('too_common');
    }
  });

  it('does not reject a known-good strong password as too_common', async () => {
    const result = await validateNewPassword({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      orgId: '550e8400-e29b-41d4-a716-446655440099',
      newPassword: 'TG7v$Bk2#xQ8nMz3',
      pool: mockPool,
      hibp: vi.fn().mockResolvedValue(''),
    });

    if (!result.ok) {
      expect(result.reasons).not.toContain('too_common');
    }
  });

  it('writes byte-identical output when the fetcher is run twice', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'monopilot-auth-passwords-'));
    const first = path.join(tempDir, 'first.txt');
    const second = path.join(tempDir, 'second.txt');

    try {
      await execFileAsync(
        'pnpm',
        ['--filter', '@monopilot/worker', 'exec', 'tsx', fetcher, '--out', first],
        { cwd: repoRoot },
      );
      await execFileAsync(
        'pnpm',
        ['--filter', '@monopilot/worker', 'exec', 'tsx', fetcher, '--out', second],
        { cwd: repoRoot },
      );

      const firstBytes = await readFile(first);
      const secondBytes = await readFile(second);
      expect(Buffer.compare(firstBytes, secondBytes)).toBe(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
