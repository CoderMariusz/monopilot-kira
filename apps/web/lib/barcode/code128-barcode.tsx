'use client';

import React from 'react';

import { encodeCode128Pattern } from '@monopilot/gs1/code128';
import {
  resolveBarcodePayload,
  type BarcodeSymbology,
  type ResolvedBarcode,
} from '@monopilot/gs1/barcode-resolve';

export type Code128BarcodeProps = {
  value: string;
  field?: string;
  symbology?: BarcodeSymbology;
  /** Override resolved payload (skips field/symbology resolution). */
  resolved?: ResolvedBarcode;
  /** Bar height in SVG user units (caption sits below). */
  barHeight?: number;
  className?: string;
  'data-testid'?: string;
};

function buildRects(pattern: string, barHeight: number): React.ReactNode[] {
  const rects: React.ReactNode[] = [];
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== '1') continue;
    rects.push(<rect key={index} x={index} y={0} width={1} height={barHeight} fill="#000" />);
  }
  return rects;
}

export function resolveCode128Barcode(input: {
  value: string;
  field?: string;
  symbology?: BarcodeSymbology;
}): ResolvedBarcode {
  return resolveBarcodePayload(input);
}

/**
 * Print-safe inline SVG Code128 / GS1-128 barcode. Scales via width/height CSS;
 * no external fonts (caption uses system monospace stack).
 */
export function Code128Barcode({
  value,
  field,
  symbology,
  resolved,
  barHeight = 32,
  className,
  'data-testid': testId,
}: Code128BarcodeProps) {
  const payload = resolved ?? resolveBarcodePayload({ value, field, symbology });
  const pattern = encodeCode128Pattern(payload.value, { gs1: payload.gs1 });
  const captionHeight = 12;
  const width = pattern.length;
  const height = barHeight + captionHeight;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={payload.caption}
      className={className}
      data-testid={testId}
    >
      {buildRects(pattern, barHeight)}
      <text
        x={width / 2}
        y={height - 2}
        textAnchor="middle"
        fontSize={9}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        fill="#0f172a"
      >
        {payload.caption}
      </text>
    </svg>
  );
}
