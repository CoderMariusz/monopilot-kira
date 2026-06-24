// Plain (NON-'use server') constants for the bulk-import results.
//
// commit-import.ts is a 'use server' module, which may export ONLY async
// functions — exporting a string const from it passes typecheck but fails
// `next build` ("a 'use server' file can only export async functions, found
// string"). So the import-result error code lives here and is imported back.
export const INVALID_STATUS_TRANSITION_IMPORT_ERROR = 'invalid_status_transition' as const;
