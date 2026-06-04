import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DB_EVENT_TYPES } from '../events.enum';

/**
 * ENUM <-> DB CHECK drift gate.
 *
 * The outbox event vocabulary has THREE historical sources that silently
 * desynced (foundation audit `_meta/runs/sidecar/reports/foundation-audit.md`):
 * the TS enum, the DB CHECK `outbox_events_event_type_check`, and the strings
 * emitted by shipped code. Per the human ENUM-AUTHORITATIVE decision the enum is
 * now the single source of truth and the DB CHECK is derived from it.
 *
 * This test makes that derivation enforceable: it parses the LATEST migration
 * that (re)creates `outbox_events_event_type_check` and asserts its string set
 * is exactly `DB_EVENT_TYPES` (= canonical EventType values ∪ LegacyEventAlias
 * keys). If anyone adds an enum member without a migration, drops a DB string
 * the enum still permits, or hand-edits the CHECK, this fails — so enum and
 * CHECK can never silently diverge again.
 */
const migrationsDir = resolve(__dirname, '../../../db/migrations');
const CHECK_CONSTRAINT_NAME = 'outbox_events_event_type_check';

interface CheckMigration {
  file: string;
  events: Set<string>;
}

/**
 * Find the highest-numbered migration that adds the CHECK constraint with an
 * `event_type in ( ... )` list, and parse the quoted string literals from it.
 */
function loadLatestCheckMigration(): CheckMigration {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    // numeric prefix sort (010 < 100 etc.)
    .sort((a, b) => {
      const na = Number.parseInt(a.split('-')[0] ?? '0', 10);
      const nb = Number.parseInt(b.split('-')[0] ?? '0', 10);
      return na - nb;
    });

  for (let i = files.length - 1; i >= 0; i -= 1) {
    const file = files[i]!;
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    if (!sql.includes(CHECK_CONSTRAINT_NAME)) continue;

    // Locate the `... check ( event_type in ( <list> ) )` body for the add.
    const addIdx = sql.toLowerCase().indexOf('add constraint');
    if (addIdx === -1) continue;
    const inMatch = /event_type\s+in\s*\(([\s\S]*?)\)\s*\)/i.exec(sql.slice(addIdx));
    if (!inMatch) continue;

    const events = new Set<string>(
      (inMatch[1].match(/'([^']+)'/g) ?? []).map((q) => q.slice(1, -1)),
    );
    return { file, events };
  }

  throw new Error(
    `No migration found that adds the ${CHECK_CONSTRAINT_NAME} CHECK constraint`,
  );
}

describe('outbox enum <-> DB CHECK drift gate', () => {
  const enumSet = new Set<string>(DB_EVENT_TYPES);

  it('the enum is the single source of truth — no duplicate DB strings', () => {
    expect(enumSet.size).toBe(DB_EVENT_TYPES.length);
  });

  it('the latest CHECK migration matches the enum-derived DB_EVENT_TYPES exactly', () => {
    const { file, events } = loadLatestCheckMigration();

    const missingFromCheck = [...enumSet].filter((e) => !events.has(e)).sort();
    const extraInCheck = [...events].filter((e) => !enumSet.has(e)).sort();

    expect(
      missingFromCheck,
      `events in the enum (DB_EVENT_TYPES) but MISSING from CHECK in ${file} — add a migration`,
    ).toEqual([]);
    expect(
      extraInCheck,
      `events in CHECK ${file} but NOT in the enum — add them to events.enum.ts (the source of truth)`,
    ).toEqual([]);

    // Belt-and-suspenders: exact set equality.
    expect(events).toEqual(enumSet);
  });
});
