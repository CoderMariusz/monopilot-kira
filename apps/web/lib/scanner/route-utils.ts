import { NextResponse } from 'next/server';

export function jsonOk<T extends Record<string, unknown>>(body: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { status });
}

export function jsonError(error: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function nullableStringField(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() || null : undefined;
}

export function validPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
