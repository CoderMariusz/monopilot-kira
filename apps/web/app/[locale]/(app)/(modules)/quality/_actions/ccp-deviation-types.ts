/** Shared CCP deviation contracts — kept outside 'use server' modules for RSC/client import. */

export type CcpDeviationDisposition = 'corrected' | 'product_held' | 'disposed';

export const CCP_DEVIATION_DISPOSITIONS = [
  'corrected',
  'product_held',
  'disposed',
] as const satisfies readonly CcpDeviationDisposition[];
