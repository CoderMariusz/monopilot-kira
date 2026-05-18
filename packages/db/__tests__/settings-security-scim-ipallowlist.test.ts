import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(__dirname, '../migrations/044-settings-security-scim-ipallowlist.sql'),
  'utf8',
);

describe('migration 044 — SCIM tokens + admin IP allowlist security tables', () => {
  it('creates public.scim_tokens with org scope, revocation, and active last-four index', () => {
    expect(migration).toMatch(/create table if not exists public\.scim_tokens/i);
    expect(migration).toMatch(/org_id uuid not null references public\.organizations\(id\) on delete cascade/i);
    expect(migration).toMatch(/scim_token_hash text not null/i);
    expect(migration).toMatch(/scim_token_last_four text not null/i);
    expect(migration).toMatch(/revoked_at timestamptz null/i);
    expect(migration).toMatch(/where revoked_at is null/i);
  });

  it('enforces RLS and app_user grants for public.scim_tokens', () => {
    expect(migration).toMatch(/alter table public\.scim_tokens enable row level security/i);
    expect(migration).toMatch(/alter table public\.scim_tokens force row level security/i);
    expect(migration).toMatch(/create policy scim_tokens_org_context/i);
    expect(migration).toMatch(/using \(org_id = app\.current_org_id\(\)\)/i);
    expect(migration).toMatch(/with check \(org_id = app\.current_org_id\(\)\)/i);
    expect(migration).toMatch(/grant select, insert, update, delete on public\.scim_tokens to app_user/i);
  });

  it('creates public.admin_ip_allowlist with org scope and default-route guard', () => {
    expect(migration).toMatch(/create table if not exists public\.admin_ip_allowlist/i);
    expect(migration).toMatch(/org_id uuid not null references public\.organizations\(id\) on delete cascade/i);
    expect(migration).toMatch(/cidr inet not null/i);
    expect(migration).toMatch(/admin_ip_allowlist_no_default_route/i);
    expect(migration).toMatch(/cidr <> '0\.0\.0\.0\/0'::inet/i);
    expect(migration).toMatch(/cidr <> '::\/0'::inet/i);
    expect(migration).toMatch(/constraint admin_ip_allowlist_org_cidr_unique unique \(org_id, cidr\)/i);
  });

  it('enforces RLS and app_user grants for public.admin_ip_allowlist', () => {
    expect(migration).toMatch(/alter table public\.admin_ip_allowlist enable row level security/i);
    expect(migration).toMatch(/alter table public\.admin_ip_allowlist force row level security/i);
    expect(migration).toMatch(/create policy admin_ip_allowlist_org_context/i);
    expect(migration).toMatch(/using \(org_id = app\.current_org_id\(\)\)/i);
    expect(migration).toMatch(/with check \(org_id = app\.current_org_id\(\)\)/i);
    expect(migration).toMatch(/grant select, insert, update, delete on public\.admin_ip_allowlist to app_user/i);
  });
});
