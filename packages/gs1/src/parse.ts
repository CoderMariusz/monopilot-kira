/**
 * GS1 Identifier parsers and validators.
 * Per GS1 General Specs 24.0
 */

export interface ParseResult {
  valid: boolean;
  digits: string;
  error?: string;
}

/**
 * Parse and validate GTIN (13 or 14 digits).
 */
export function parseGTIN(input: string): ParseResult {
  throw new Error('parseGTIN not yet implemented');
}

/**
 * Parse and validate SSCC-18 (18 digits).
 */
export function parseSSCC(input: string): ParseResult {
  throw new Error('parseSSCC not yet implemented');
}

/**
 * Parse and validate GLN-13 (13 digits).
 */
export function parseGLN(input: string): ParseResult {
  throw new Error('parseGLN not yet implemented');
}

/**
 * Parse and validate GRAI (14 digits: 1 + 12 item ref + check).
 */
export function parseGRAI(input: string): ParseResult {
  throw new Error('parseGRAI not yet implemented');
}

/**
 * Parse and validate GDTI (14 digits: 4 + 13 trade item + check).
 */
export function parseGDTI(input: string): ParseResult {
  throw new Error('parseGDTI not yet implemented');
}
