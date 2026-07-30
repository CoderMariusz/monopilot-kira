import { describe, expect, it } from 'vitest';

import { isKgUom, normalizePieceUom, normalizeBomSnapshotJsonUoms, pieceUomsEqual, pieceUomToWacEach } from './piece';

describe('normalizePieceUom', () => {
  it('maps legacy szt and ea to pcs', () => {
    expect(normalizePieceUom('szt')).toBe('pcs');
    expect(normalizePieceUom('ea')).toBe('pcs');
  });

  it('passes through canonical and other UoM codes', () => {
    expect(normalizePieceUom('pcs')).toBe('pcs');
    expect(normalizePieceUom('kg')).toBe('kg');
    expect(normalizePieceUom('box')).toBe('box');
  });

  it('returns undefined for empty input', () => {
    expect(normalizePieceUom('')).toBeUndefined();
    expect(normalizePieceUom(null)).toBeUndefined();
    expect(normalizePieceUom(undefined)).toBeUndefined();
  });
});

describe('pieceUomToWacEach', () => {
  it('maps canonical and legacy piece codes to each for WAC SQL', () => {
    expect(pieceUomToWacEach('pcs')).toBe('each');
    expect(pieceUomToWacEach('szt')).toBe('each');
    expect(pieceUomToWacEach('ea')).toBe('each');
  });

  it('passes through non-piece UoM codes unchanged', () => {
    expect(pieceUomToWacEach('kg')).toBe('kg');
    expect(pieceUomToWacEach('box')).toBe('box');
  });
});

describe('pieceUomsEqual', () => {
  it('treats szt, ea, and pcs as equal', () => {
    expect(pieceUomsEqual('szt', 'pcs')).toBe(true);
    expect(pieceUomsEqual('ea', 'pcs')).toBe(true);
    expect(pieceUomsEqual('ea', 'szt')).toBe(true);
  });

  it('does not equate unrelated UoM codes', () => {
    expect(pieceUomsEqual('kg', 'pcs')).toBe(false);
    expect(pieceUomsEqual('each', 'pcs')).toBe(false);
  });
});

describe('normalizeBomSnapshotJsonUoms', () => {
  it('maps legacy line and co-product uom codes to pcs on read', () => {
    const normalized = normalizeBomSnapshotJsonUoms({
      lines: [{ uom: 'ea' }, { uom: 'kg' }],
      co_products: [{ uom: 'szt' }],
    });
    expect(normalized.lines?.[0]?.uom).toBe('pcs');
    expect(normalized.lines?.[1]?.uom).toBe('kg');
    expect(normalized.co_products?.[0]?.uom).toBe('pcs');
  });
});

describe('isKgUom', () => {
  it('accepts kg (any casing/padding) and the NOT NULL DEFAULT absence', () => {
    for (const v of ['kg', 'KG', ' kg ', null, undefined, '']) {
      expect(isKgUom(v)).toBe(true);
    }
  });

  it('rejects every piece/volume code — this is what stops 500 pcs becoming 500 kg', () => {
    for (const v of ['pcs', 'szt', 'ea', 'each', 'g', 'l', 'm']) {
      expect(isKgUom(v)).toBe(false);
    }
  });
});
