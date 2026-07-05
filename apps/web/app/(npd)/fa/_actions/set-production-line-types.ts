export type SetProductionLineResult =
  | { ok: true; productionLineId: string | null }
  | { ok: false; error: string };
