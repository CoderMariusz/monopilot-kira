import { describe, expect, it } from 'vitest';

import { normalizePieceUom, pieceUomsEqual } from './piece';

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
