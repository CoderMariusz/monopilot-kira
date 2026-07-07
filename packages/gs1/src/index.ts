export { computeMod10 } from './check-digit.js';
export {
  parseGTIN,
  parseSSCC,
  parseGLN,
  parseGRAI,
  parseGDTI,
} from './parse.js';
export type { ParseResult } from './parse.js';
export { buildGs1Element } from './build.js';
export type { Gs1BuildInput, Gs1ElementResult } from './build.js';
export {
  generateSscc18,
  validateSscc18,
  formatSscc18,
  normalizeSscc18,
  SSCC_LENGTH,
  Gs1Error,
} from './sscc.js';
export type { GenerateSscc18Input } from './sscc.js';
export {
  computeGtinCheckDigit,
  validateGtin14,
  deriveGtin14FromGtin13,
  buildGtin14,
  GTIN14_LENGTH,
  GTIN13_LENGTH,
} from './gtin.js';
