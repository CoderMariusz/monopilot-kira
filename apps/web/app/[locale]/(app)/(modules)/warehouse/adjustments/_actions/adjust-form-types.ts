/**
 * Shared types for the direct stock-adjustment form reads.
 *
 * These live OUTSIDE adjust-form-actions.ts because that file carries the
 * 'use server' directive, and a "use server" module may export ONLY async
 * functions — exporting a `type` from it fails `next build` with
 * "A 'use server' file can only export async functions, found object"
 * (it passes typecheck but breaks the production build). Keep the type
 * declarations here and import them into the action file + the client form.
 */

export type DirectAdjustFormContext = {
  canAdjust: true;
};

export type EligibleSupervisor = {
  id: string;
  name: string | null;
  email: string;
};

export type DecreaseLpOption = {
  id: string;
  lpNumber: string;
  availableQty: string;
  uom: string;
  batchNumber: string | null;
  expiryDate: string | null;
};
