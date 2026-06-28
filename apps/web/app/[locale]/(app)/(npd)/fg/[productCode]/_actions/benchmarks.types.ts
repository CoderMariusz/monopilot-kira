/**
 * Types + consts + zod schemas for the FA Core multi-benchmark editor.
 *
 * SIBLING module (NOT 'use server'): a 'use server' file may only export async
 * functions, so the shared zod schemas, permission strings and result types live
 * here and are imported by benchmarks.ts (the Server Action module).
 *
 * Migration 241 — public.fa_benchmarks. RBAC permission strings are byte-identical
 * to the seeded NPD permissions (migs 149 / 236): read = 'npd.fa.read',
 * write = 'npd.core.write'.
 */
import { z } from 'zod';

/** Seeded read permission (migs 149 / 236) — gate listBenchmarks. */
export const BENCHMARK_READ_PERMISSION = 'npd.fa.read';
/** Seeded write permission (migs 149 / 236) — gate upsert/delete. */
export const BENCHMARK_WRITE_PERMISSION = 'npd.core.write';

/**
 * Outbox event type for FA Core edits (audit trail on the FA aggregate).
 * Reuses the SAME event the canonical Core cell write path emits
 * (apps/web/app/(npd)/fa/actions/update-fa-cell.ts FA_EDIT_EVENT = 'fa.edit'),
 * so it is already in the outbox_events_event_type_check allow-list and the FA
 * history treats a benchmark change as a Core edit. Do NOT invent a new event
 * string — that would require recreating the outbox CHECK (drift risk).
 */
export const FA_CORE_CHANGED_EVENT = 'fa.edit';
export const APP_VERSION = 'fa-benchmarks-v1';

/** A persisted benchmark row as returned to the client. */
export type Benchmark = {
  id: string;
  productCode: string;
  label: string;
  /** NUMERIC(12,2) as a string ('123.45') or null — never a float. */
  price: string | null;
  displayOrder: number;
};

export const listInputSchema = z.object({
  productCode: z.string().trim().min(1),
});
export type ListBenchmarksInput = z.input<typeof listInputSchema>;

export const upsertInputSchema = z.object({
  productCode: z.string().trim().min(1),
  /** Omitted/undefined → insert a new row; present → update that row. */
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(200),
  /**
   * NUMERIC(12,2) non-negative, or null/blank. Accepts a number or a numeric
   * string; '' is coerced to null. The DB CHECK is the final guard.
   */
  price: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v === undefined || v === null || v === '' ? null : String(v)))
    .refine((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0), {
      message: 'price must be a non-negative number',
    }),
  displayOrder: z.number().int().min(0).optional(),
});
export type UpsertBenchmarkInput = z.input<typeof upsertInputSchema>;

export const deleteInputSchema = z.object({
  productCode: z.string().trim().min(1),
  id: z.string().uuid(),
});
export type DeleteBenchmarkInput = z.input<typeof deleteInputSchema>;
