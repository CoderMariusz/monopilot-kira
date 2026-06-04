import type { ZodObject, ZodRawShape } from 'zod';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  schema: ZodObject<ZodRawShape>;
};

const cache = new Map<string, CacheEntry>();

export function deptZodCacheKey(orgId: string, dept: string, schemaVersion: number): string {
  return `${orgId}:${dept}:${schemaVersion}`;
}

export function getCachedDeptZod(
  orgId: string,
  dept: string,
  schemaVersion: number,
  now = Date.now(),
): ZodObject<ZodRawShape> | undefined {
  const key = deptZodCacheKey(orgId, dept, schemaVersion);
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry.schema;
}

export function setCachedDeptZod(
  orgId: string,
  dept: string,
  schemaVersion: number,
  schema: ZodObject<ZodRawShape>,
  now = Date.now(),
): void {
  cache.set(deptZodCacheKey(orgId, dept, schemaVersion), {
    expiresAt: now + FIVE_MINUTES_MS,
    schema,
  });
}

export function clearDeptZodCache(): void {
  cache.clear();
}
