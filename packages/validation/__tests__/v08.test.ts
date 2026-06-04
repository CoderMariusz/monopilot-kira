import { describe, expect, it } from 'vitest';

import { validateBriefMappingV08 } from '../src/v08-brief-mapping.js';

const mandatory = Array.from({ length: 13 }, (_, index) => `C${index + 1}`);
const optional = Array.from({ length: 7 }, (_, index) => `C${index + 14}`);

describe('V08 brief mapping validation', () => {
  it('returns PASS when all 13 mandatory compatibility audit mappings are applied', () => {
    const result = validateBriefMappingV08([
      ...mandatory.map((fieldName) => ({ fieldName, applied: true })),
      ...optional.map((fieldName) => ({ fieldName, applied: true })),
    ]);

    expect(result).toEqual({ status: 'PASS', details: [] });
  });

  it('returns WARN when mandatory mappings pass but optional fields are absent or not applied', () => {
    const result = validateBriefMappingV08([
      ...mandatory.map((fieldName) => ({ fieldName, applied: true })),
      { fieldName: 'C14', applied: false },
    ]);

    expect(result.status).toBe('WARN');
    expect(result.details).toEqual(
      expect.arrayContaining([
        { code: 'OPTIONAL_MAPPING_NOT_APPLIED', fieldName: 'C14' },
        { code: 'OPTIONAL_MAPPING_NOT_APPLIED', fieldName: 'C20' },
      ]),
    );
  });

  it('returns FAIL when any mandatory field is missing from the audit or not applied', () => {
    const result = validateBriefMappingV08([
      ...mandatory
        .filter((fieldName) => fieldName !== 'C7')
        .map((fieldName) => ({ fieldName, applied: true })),
      { fieldName: 'C7', applied: false },
    ]);

    expect(result.status).toBe('FAIL');
    expect(result.details).toEqual([{ code: 'MANDATORY_MAPPING_NOT_APPLIED', fieldName: 'C7' }]);
  });
});
