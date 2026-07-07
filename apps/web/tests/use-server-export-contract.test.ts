/**
 * CI guard: `'use server'` modules may export ONLY async functions (runtime).
 * `export type` / `export interface` / `export type { ... }` are compile-time and allowed.
 * Runtime consts/enums/classes/default/non-async fn/value re-exports break `next build`.
 *
 * D1a regression targets are hard-fail. Repo-wide ESLint (`monopilot/no-export-type-in-use-server`)
 * catches new runtime violations elsewhere on `pnpm lint`.
 */
import { describe, expect, it } from 'vitest';

import {
  D1A_USE_SERVER_REGRESSION_FILES,
  isForbiddenUseServerExportLine,
  scanD1aRegressionTargets,
} from './lib/use-server-export-analyzer';

describe('use server export line classifier', () => {
  it('allows compile-time type exports', () => {
    expect(isForbiddenUseServerExportLine('export type Foo = string')).toBe(false);
    expect(isForbiddenUseServerExportLine('export interface Bar { id: string }')).toBe(false);
    expect(isForbiddenUseServerExportLine('export type { Baz } from "./sibling"')).toBe(false);
    expect(isForbiddenUseServerExportLine('export { type Qux } from "./sibling"')).toBe(false);
    expect(isForbiddenUseServerExportLine('export async function ok() {}')).toBe(false);
  });

  it('flags runtime value exports', () => {
    expect(isForbiddenUseServerExportLine('export const schema = z.object({})')).toBe(true);
    expect(isForbiddenUseServerExportLine('export function sync() {}')).toBe(true);
    expect(isForbiddenUseServerExportLine('export enum Status { A }')).toBe(true);
    expect(isForbiddenUseServerExportLine('export class Foo {}')).toBe(true);
    expect(isForbiddenUseServerExportLine('export default Foo')).toBe(true);
    expect(isForbiddenUseServerExportLine('export { schema } from "./sibling"')).toBe(true);
    expect(isForbiddenUseServerExportLine('export { schema, type T } from "./sibling"')).toBe(true);
  });
});

describe('use server export contract (D1a regression)', () => {
  const violations = scanD1aRegressionTargets();

  it('covers all nine D1a target modules', () => {
    expect(D1A_USE_SERVER_REGRESSION_FILES).toHaveLength(9);
  });

  it('D1a targets export only async functions (no runtime values)', () => {
    if (violations.length > 0) {
      const detail = violations.map((v) => `${v.file}:${v.line} → ${v.exportLine}`).join('\n');
      expect.fail(`'use server' runtime export(s) in D1a targets:\n${detail}`);
    }
    expect(violations).toEqual([]);
  });
});
