/**
 * Stub `next/cache` — poza scope'em requestu Next `revalidatePath` RZUCA,
 * a rzut wewnątrz `withOrgContext` wycofuje CAŁĄ transakcję (patrz komentarz
 * w apps/web/lib/i18n/revalidate-localized.ts). W produkcji (server action)
 * scope istnieje, więc bez tego stubu sonda mierzyłaby artefakt harnessu,
 * nie zachowanie aplikacji.
 */
export function revalidatePath(): void {}
export function revalidateTag(): void {}
export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
export function unstable_noStore(): void {}
