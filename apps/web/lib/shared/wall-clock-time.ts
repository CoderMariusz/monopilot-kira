/**
 * Wall-clock date + time in an IANA timezone → UTC epoch ms.
 * Uses Intl only — no extra date library.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseWallClockParts(blockDate: string, time: string): WallClockParts | null {
  const dateMatch = DATE_RE.exec(blockDate);
  const timeMatch = TIME_RE.exec(time);
  if (!dateMatch || !timeMatch) return null;
  return {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] ?? '0'),
  };
}

function utcMsFromParts(parts: WallClockParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const mapped = Object.fromEntries(
    formatter
      .formatToParts(new Date(utcMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const zonedAsUtc = Date.UTC(
    Number(mapped.year),
    Number(mapped.month) - 1,
    Number(mapped.day),
    Number(mapped.hour),
    Number(mapped.minute),
    Number(mapped.second),
  );
  return zonedAsUtc - utcMs;
}

function formatWallClockInZone(utcMs: number, timeZone: string): WallClockParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const mapped = Object.fromEntries(
    formatter
      .formatToParts(new Date(utcMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
    hour: Number(mapped.hour),
    minute: Number(mapped.minute),
    second: Number(mapped.second),
  };
}

function wallClockMatches(parts: WallClockParts, blockDate: string, time: string): boolean {
  const date = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const hh = String(parts.hour).padStart(2, '0');
  const mm = String(parts.minute).padStart(2, '0');
  const ss = String(parts.second).padStart(2, '0');
  const normalizedTime = time.length <= 5 ? `${hh}:${mm}` : `${hh}:${mm}:${ss}`;
  return date === blockDate && normalizedTime === (time.length <= 5 ? `${hh}:${mm}` : `${hh}:${mm}:${ss}`);
}

function instantFromOffset(parts: WallClockParts, offsetMs: number): number {
  return utcMsFromParts(parts) - offsetMs;
}

/**
 * Resolve a wall-clock instant in `timeZone`. For ambiguous fall-back times, picks
 * standard (non-DST) offset. For spring-forward gaps, advances to the next valid minute.
 */
export function wallClockToInstant(
  blockDate: string,
  time: string,
  timeZone: string,
): number | null {
  const parts = parseWallClockParts(blockDate, time);
  if (!parts) return null;

  const naiveUtc = utcMsFromParts(parts);
  const offsetAtNaive = getTimeZoneOffsetMs(naiveUtc, timeZone);
  const candidates = new Set<number>([instantFromOffset(parts, offsetAtNaive)]);

  const offsetOneHourEarlier = getTimeZoneOffsetMs(naiveUtc - 60 * 60 * 1000, timeZone);
  const offsetOneHourLater = getTimeZoneOffsetMs(naiveUtc + 60 * 60 * 1000, timeZone);
  candidates.add(instantFromOffset(parts, offsetOneHourEarlier));
  candidates.add(instantFromOffset(parts, offsetOneHourLater));

  const valid = [...candidates].filter((candidate) =>
    wallClockMatches(formatWallClockInZone(candidate, timeZone), blockDate, time),
  );
  if (valid.length === 0) {
    for (let minute = 1; minute <= 180; minute += 1) {
      const probe = naiveUtc + minute * 60 * 1000;
      const offset = getTimeZoneOffsetMs(probe, timeZone);
      const candidate = instantFromOffset(parts, offset);
      if (wallClockMatches(formatWallClockInZone(candidate, timeZone), blockDate, time)) {
        return candidate;
      }
    }
    return null;
  }

  valid.sort((a, b) => getTimeZoneOffsetMs(a, timeZone) - getTimeZoneOffsetMs(b, timeZone));
  return valid[0] ?? null;
}
