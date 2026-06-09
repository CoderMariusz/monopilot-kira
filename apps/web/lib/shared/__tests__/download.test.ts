/**
 * @vitest-environment jsdom
 *
 * LANE 14 — shared client-side download helpers.
 *
 * Verifies RFC-4180 CSV quoting (quote / comma / newline → doubled-quote wrap),
 * deterministic date stamping + filename slugging, and that `downloadBlob`
 * performs the Blob → object-URL → anchor-click → revoke sequence (with the
 * jsdom mocks for `URL.createObjectURL` / `revokeObjectURL`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  csvCell,
  toCsv,
  downloadBlob,
  downloadCsv,
  downloadJson,
  isoDateStamp,
  fileSafe,
} from '../download';

afterEach(() => vi.restoreAllMocks());

describe('csvCell / toCsv (RFC 4180)', () => {
  it('leaves plain values unquoted', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes and doubles inner quotes / commas / newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('builds a CRLF-separated CSV with a header', () => {
    const csv = toCsv(['code', 'note'], [
      ['RM1', 'plain'],
      ['RM2', 'has, comma'],
    ]);
    expect(csv).toBe('code,note\r\nRM1,plain\r\nRM2,"has, comma"');
  });
});

describe('isoDateStamp / fileSafe', () => {
  it('stamps YYYY-MM-DD from an injected date', () => {
    expect(isoDateStamp(new Date('2026-06-09T13:45:00Z'))).toBe('2026-06-09');
  });

  it('slugs unsafe filename segments', () => {
    expect(fileSafe('FG 51/01')).toBe('FG-51-01');
    expect(fileSafe('')).toBe('export');
    expect(fileSafe(null)).toBe('export');
    expect(fileSafe('SKU-2451')).toBe('SKU-2451');
  });
});

describe('downloadBlob', () => {
  it('creates an object URL, clicks a download anchor and revokes', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    // jsdom has no Blob URL support — stub it.
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
    const clicked: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      });

    const name = downloadCsv('a,b\r\n1,2', 'sample.csv');

    expect(name).toBe('sample.csv');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual(['sample.csv']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('serializes JSON with 2-space indentation', () => {
    let captured: BlobPart[] | undefined;
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends OriginalBlob {
        constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
          super(parts, opts);
          captured = parts;
        }
      },
    );
    vi.stubGlobal(
      'URL',
      Object.assign(globalThis.URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson({ a: 1, b: ['x'] }, 'p.json');

    expect(String(captured?.[0])).toBe('{\n  "a": 1,\n  "b": [\n    "x"\n  ]\n}');
  });

  it('is a no-op when document is unavailable (returns the filename)', () => {
    const doc = globalThis.document;
    // @ts-expect-error — simulate SSR
    delete (globalThis as { document?: Document }).document;
    try {
      expect(downloadBlob('x', 'f.txt', 'text/plain')).toBe('f.txt');
    } finally {
      globalThis.document = doc;
    }
  });
});
