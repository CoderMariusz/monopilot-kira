import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../..');
const appRoot = path.join(webRoot, 'app/[locale]/login');

function readIfExists(relativePath: string) {
  const absolutePath = path.join(appRoot, relativePath);
  const exists = existsSync(absolutePath);
  expect(exists, `${relativePath} must exist for T-126 login UI`).toBe(true);
  return exists ? readFileSync(absolutePath, 'utf8') : '';
}

function readWebFile(relativePath: string) {
  const absolutePath = path.join(webRoot, relativePath);
  const exists = existsSync(absolutePath);
  expect(exists, `${relativePath} must exist for AUTH-UI-PARITY-001`).toBe(true);
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

function firstExisting(paths: string[]) {
  return paths.map((candidate) => path.join(webRoot, candidate)).find((candidate) => existsSync(candidate));
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

describe('AUTH-UI-PARITY-001 prototype parity RED contract', () => {
  it('uses the prototype light gradient shell instead of a dark/default login surface', () => {
    const layout = readIfExists('layout.tsx');

    expect(layout, 'login shell should translate prototype radial + linear soft gradient').toMatch(
      /radial-gradient|bg-\[radial-gradient|from-\[#f8fafc\]|from-slate-50/,
    );
    expect(layout, 'prototype shell is light; dark slate shell is visual drift').not.toMatch(/bg-slate-9\d\d|bg-black/);
    expect(layout, 'prototype centers a 480px card column').toMatch(/480px|max-w-\[480px\]|w-\[480px\]/);
  });

  it('pins the prototype card and brand lockup hierarchy on the sign-in route', () => {
    const page = readIfExists('page.tsx');

    expect(page, 'card should keep prototype 12px radius, 36px padding, subtle border/shadow').toMatch(
      /rounded-\[12px\]|rounded-xl/,
    );
    expect(page).toMatch(/p-\[36px\]|px-\[36px\]|py-\[36px\]/);
    expect(page, 'brand mark is the 36px M tile, not a larger MP badge').toMatch(/h-9[^\n]*w-9|h-\[36px\][^\n]*w-\[36px\]/);
    expect(page).toMatch(/>\s*M\s*</);
    expect(page, 'title/subtitle text should match prototype copy').toMatch(/Welcome back/);
    expect(page).toMatch(/Sign in to your MES workspace/);
  });

  it('pins sign-in affordances and footer links from prototypes/auth/login.html', () => {
    const source = readLoginSources();

    expect(source).toMatch(/Work email/);
    expect(source).toMatch(/you@company\.com/);
    expect(source).toMatch(/Remember me for 30 days/);
    expect(source).toMatch(/Contact your admin/);
    expect(source).toMatch(/©\s*2026\s*MonoPilot MES|&copy;\s*2026\s*MonoPilot MES/);
    expect(source).toMatch(/Privacy/);
    expect(source).toMatch(/Terms/);
    expect(source).toMatch(/Status/);
  });

  it('pins the forgot-password info banner and reset-sent state machine', () => {
    const forgotPage = readIfExists('forgot-password/page.tsx');

    expect(forgotPage).toMatch(/The link expires in|30 minutes/);
    expect(forgotPage, 'forgot success should use prototype sent-art/inbox state, not only a small banner').toMatch(
      /sent-art|Check your inbox|reset link to|✉|envelope/i,
    );
    expect(forgotPage).toMatch(/Try a different email|Didn't get it/);
  });

  it('requires Tailwind utilities to be generated for app and workspace UI sources', () => {
    const globals = readWebFile('app/globals.css');
    const postcssPath = firstExisting(['postcss.config.mjs', 'postcss.config.js', 'postcss.config.cjs']);

    expect(globals).toContain('@import "tailwindcss"');
    expect(globals, 'Tailwind v4 must scan local app and workspace UI package sources').toMatch(
      /@source\s+["'][^"']*(\.\/|\.\.\/)app[^"']*["'][\s\S]*@source\s+["'][^"']*(packages\/ui|@monopilot\/ui|\.\.\/\.\.\/packages\/ui)[^"']*["']|@source\s+["'][^"']*(packages\/ui|@monopilot\/ui|\.\.\/\.\.\/packages\/ui)[^"']*["'][\s\S]*@source\s+["'][^"']*(\.\/|\.\.\/)app[^"']*["']/,
    );
    expect(postcssPath, 'apps/web needs an explicit PostCSS config for Tailwind utility generation').toBeTruthy();
    const postcss = postcssPath ? readFileSync(postcssPath, 'utf8') : '';
    expect(postcss).toContain('@tailwindcss/postcss');
  });
});
