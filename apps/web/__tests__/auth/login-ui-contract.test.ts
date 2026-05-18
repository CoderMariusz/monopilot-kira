import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '../../app/[locale]/login');

function readIfExists(relativePath: string) {
  const absolutePath = path.join(appRoot, relativePath);
  const exists = existsSync(absolutePath);
  expect(exists, `${relativePath} must exist for T-126 login UI`).toBe(true);
  return exists ? readFileSync(absolutePath, 'utf8') : '';
}

function readLoginSources() {
  if (!existsSync(appRoot)) return '';

  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) visit(fullPath);
      else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(fullPath);
    }
  };

  visit(appRoot);
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

describe('T-126 login UI contract', () => {
  it('defines a minimal full-screen login layout without the app shell', () => {
    const source = readIfExists('layout.tsx');

    expect(source).toContain('min-h-screen');
    expect(source).toContain('bg-slate-950');
    expect(source).toContain('items-center');
    expect(source).toContain('justify-center');
  });

  it('defines /[locale]/login with password sign-in fields, locale-aware forgot link, and disabled SSO placeholder', () => {
    readIfExists('page.tsx');
    const source = readLoginSources();

    expect(source).toMatch(/MonoPilot|Monopilot/);
    expect(source).toMatch(/type=["']email["']|type:\s*["']email["']/);
    expect(source).toMatch(/autoFocus|auto-focus|autofocus/);
    expect(source).toMatch(/type=["']password["']|type:\s*["']password["']/);
    expect(source).toContain('forgot-password');
    expect(source).toMatch(/Sign in|sign in|signin/);
    expect(source).toMatch(/SSO|sso/);
    expect(source).toMatch(/disabled|aria-disabled/);
    expect(source).toContain('signInWithPassword');
  });

  it('defines /[locale]/login/forgot-password with reset email form, success state, and back link', () => {
    readIfExists('forgot-password/page.tsx');
    const source = readLoginSources();

    expect(source).toMatch(/Reset your password|reset your password|password reset/);
    expect(source).toMatch(/type=["']email["']|type:\s*["']email["']/);
    expect(source).toMatch(/Send reset link|send reset link/);
    expect(source).toMatch(/Check your email|reset link has been sent|success/);
    expect(source).toContain('/login');
    expect(source).toContain('sendPasswordReset');
  });

  it('defines /[locale]/login/mfa with six-digit TOTP verification and recovery-code stub', () => {
    readIfExists('mfa/page.tsx');
    const source = readLoginSources();

    expect(source).toMatch(/Two-factor authentication|two-factor authentication/);
    expect(source).toMatch(/maxLength=\{?6\}?|maxLength:\s*6/);
    expect(source).toMatch(/inputMode=["']numeric["']|inputmode=["']numeric["']|type=["']number["']/);
    expect(source).toMatch(/Verify|verify/);
    expect(source).toMatch(/Use recovery code|recovery code/);
    expect(source).toMatch(/challengeAndVerify|mfa/);
  });

  it('defines locale-aware Supabase auth server actions for password sign-in and reset email', () => {
    const source = readIfExists('_actions/auth.ts');

    expect(source).toContain("'use server'");
    expect(source).toContain('createSupabaseServerClient');
    expect(source).toContain('signInWithPassword');
    expect(source).toMatch(/formData\.get\(["']email["']\)/);
    expect(source).toMatch(/formData\.get\(["']password["']\)/);
    expect(source).toMatch(/formData\.get\(["']locale["']\)/);
    expect(source).toContain('supabase.auth.signInWithPassword');
    expect(source).toMatch(/redirect\(`\/\$\{locale\}\/?`\)|redirect\(`\/\$\{locale\}\/`\)/);
    expect(source).toContain('resetPasswordForEmail');
    expect(source).toContain('NEXT_PUBLIC_SITE_URL');
  });
});
