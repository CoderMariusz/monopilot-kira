import type pg from 'pg';

export type ErasureReason = 'gdpr-rtbf';

export interface ErasureContext {
  orgId: string;
  subjectId: string;
  reason: ErasureReason;
  tx: pg.PoolClient;
  dryRun: boolean;
}

export interface ErasureResult {
  domain: string;
  rowsAffected: number;
  tablesTouched: string[];
  warnings: string[];
}

export type ErasureHandler = (ctx: ErasureContext) => Promise<ErasureResult>;

export interface ErasureRunOptions {
  dryRun?: boolean;
  domains?: string[];
}

export interface ErasureRunReport {
  orgId: string;
  subjectId: string;
  reason: ErasureReason;
  dryRun: boolean;
  results: ErasureResult[];
  rowsAffected: number;
  tablesTouched: string[];
  warnings: string[];
}
