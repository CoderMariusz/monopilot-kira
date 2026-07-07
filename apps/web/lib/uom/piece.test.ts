import { describe, expect, it } from 'vitest';

import { normalizePieceUom, normalizeBomSnapshotJsonUoms, pieceUomsEqual } from './piece';

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
