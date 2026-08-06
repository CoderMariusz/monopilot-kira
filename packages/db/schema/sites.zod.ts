import { z } from 'zod';

// 14-multi-site — sites zod validation (T-002, §11.1 V-MS-04).
// IANA-timezone refinement at the app layer (no hardcoded list — uses Intl.supportedValuesOf).
// The DB column defaults to 'UTC'; this schema is the write-path guard for site create/edit.

/**
 * True when `tz` is a valid IANA time-zone name per the runtime's ICU data.
 * `Intl.supportedValuesOf('timeZone')` is the canonical, non-hardcoded source (V-MS-04 red line).
 */
export function isValidIanaTimezone(tz: string): boolean {
  try {
    const supported = Intl.supportedValuesOf?.('timeZone');
    if (supported) {
      return supported.includes(tz);
    }
    // Fallback for runtimes without supportedValuesOf: construct a formatter (throws on invalid TZ).
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const ianaTimezone = z
  .string()
  .refine(isValidIanaTimezone, { message: 'invalid IANA timezone' });

// Format-only. `z.string().uuid()` enforces the RFC-4122 version byte, which rejects the
// canonical org 00000000-0000-0000-0000-000000000002 (migration 030, version=0, variant=0).
// Org ids on this deployment are hand-seeded literals, not generated v4s. Cf. sites.ts.
const orgUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const siteInsertSchema = z.object({
  orgId: orgUuid,
  siteCode: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  isDefault: z.boolean().optional(),
  legalEntity: z.string().max(256).nullish(),
  timezone: ianaTimezone.default('UTC'),
  country: z.string().max(8).nullish(),
  dataResidencyRegion: z.string().max(64).nullish(),
  hierarchyConfigId: z.string().uuid().nullish(),
  parentSiteId: z.string().uuid().nullish(),
  address: z.record(z.unknown()).optional(),
  l3ExtCols: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const siteUpdateSchema = siteInsertSchema.partial().extend({
  timezone: ianaTimezone.optional(),
});

export type SiteInsertInput = z.infer<typeof siteInsertSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
