import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { buildMessages } from '../request';

/**
 * CLASS-CLOSING GUARD for "raw i18n key path on screen".
 *
 * next-intl's `t()` on a message that still holds an unfilled ICU placeholder raises
 * FORMATTING_ERROR and answers with the dotted KEY PATH — never the template. Screens that
 * substitute on the CLIENT (`.replace('{rows}', n)`, `interpolate(label, {...})`) therefore
 * ship the key path straight to the user, in EVERY language including English. The usual guard
 * `translated !== key` compares that path against the BARE key, so it waves the leak through.
 *
 * Two fixes already went in one message at a time (63f8016d — 13 list footers, b3222485 — 6
 * settings keys). This test is what makes the NEXT one impossible: it walks every real call
 * site in `apps/web/app`, resolves it through a REAL translator over the REAL shipped catalog,
 * and fails if the answer is a key path. A unit test that injects labels literally — which is
 * what every screen suite here does — cannot see this defect at all; that anti-test is what let
 * it ship in the first place.
 *
 * ponytail: the scanner is a regex over source, not a TS parser. Literal call sites (`t('key')`)
 * are exact. Loop builders (`labels[key] = t(key)`) cannot be resolved statically, so the file's
 * own string literals and defaults-map property names are used as the candidate key list — a
 * deliberate SUPERSET: a builder that supplies values for only some keys (schema/diff's
 * `key.endsWith('ed') ? { count } : undefined`) contributes a few keys that do not actually leak.
 * Over-reporting into a shrink-only backlog is the safe direction; under-reporting is how this
 * defect shipped three times. Upgrade path if that stops being enough: ts-morph over the same
 * call sites.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, '..', '..', 'app');

/** `const t = await getTranslations({ locale, namespace: 'a.b' })` / `getTranslations('a.b')` /
 *  `useTranslations('a.b')` — capture the binding name and the namespace it is bound to.
 *  The namespace may be a literal or a `const NS = 'a.b'` declared in the same file. */
const BINDING_RE =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\s*\(\s*(?:\{[^}]*?namespace:\s*)?(['"]([^'"]+)['"]|[A-Z_][A-Z0-9_]*)/g;
const NS_CONST_RE = /(?:const|let)\s+([A-Z_][A-Z0-9_]*)\s*(?::[^=]+)?=\s*['"]([\w.$-]+)['"]/g;

/** `t('some.key')` with NO second argument — the exact shape that leaks. */
const CALL_RE = /\b([A-Za-z_$][\w$]*)\(\s*(['"])([\w.$-]+)\2\s*\)/g;
/** `labels[key] = t(key)` — the SAME leak driven off a key list. Six builders ship this shape
 *  with no guard at all, and a literal-key scanner is blind to every one of them. The trailing
 *  `[,)]` also catches `t(key, cond ? {…} : undefined)`, where the undefined branch leaks. */
const DYNAMIC_CALL_RE = /\b([A-Za-z_$][\w$]*)\(\s*[A-Za-z_$][\w$.]*\s*[,)]/g;
/** Key lists live as bare string literals (`const LABEL_KEYS = ['planNotice', …]`) or as the
 *  property names of a defaults map walked with `Object.keys(DEFAULT_LABELS)`. */
const STRING_LITERAL_RE = /(['"])([\w.$-]+)\1/g;
const PROPERTY_KEY_RE = /^\s*([A-Za-z_$][\w$]*)\s*:/gm;

const PLACEHOLDER_RE = /\{\s*[\w]+\s*[,}]/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      sourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

type Site = { file: string; binding: string; namespace: string; key: string };

function callSites(file: string): Site[] {
  const src = readFileSync(file, 'utf8');
  const nsConsts = new Map([...src.matchAll(NS_CONST_RE)].map(([, name, value]) => [name, value]));

  const namespaces = new Map<string, Set<string>>();
  for (const [, binding, literalOrIdent, literal] of src.matchAll(BINDING_RE)) {
    const namespace = literal ?? nsConsts.get(literalOrIdent);
    if (!namespace) continue;
    (namespaces.get(binding) ?? namespaces.set(binding, new Set()).get(binding)!).add(namespace);
  }
  if (namespaces.size === 0) return [];

  const sites: Site[] = [];
  for (const [, binding, , key] of src.matchAll(CALL_RE)) {
    for (const namespace of namespaces.get(binding) ?? []) sites.push({ file, binding, namespace, key });
  }
  // Loop builders: the key is an identifier, so the candidate keys are the file's own string
  // literals (its LABEL_KEYS list). Keys that aren't messages get dropped by the caller.
  const dynamic = [...src.matchAll(DYNAMIC_CALL_RE)].filter(([, binding]) => namespaces.has(binding));
  if (dynamic.length > 0) {
    const candidates = new Set([
      ...[...src.matchAll(STRING_LITERAL_RE)].map(([, , key]) => key),
      ...[...src.matchAll(PROPERTY_KEY_RE)].map(([, key]) => key),
    ]);
    for (const [, binding] of dynamic) {
      for (const namespace of namespaces.get(binding) ?? []) {
        for (const key of candidates) sites.push({ file, binding, namespace, key });
      }
    }
  }
  return sites;
}

function lookup(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[part];
  }, tree);
}

const BASELINE_FILE = join(HERE, 'icu-template-key-leak.baseline.txt');

async function detectLeaks(): Promise<string[]> {
  // The REAL shipped tree, through the REAL loader (base catalog + split settings namespace).
  const messages = await buildMessages('en');
  const files = sourceFiles(APP_ROOT);
  expect(files.length, 'scanner must actually see the app sources').toBeGreaterThan(200);

  const translators = new Map<string, ReturnType<typeof createTranslator>>();
  const leaks = new Set<string>();
  const checked = new Set<string>();

  for (const site of files.flatMap(callSites)) {
    const path = `${site.namespace}.${site.key}`;
    const id = `${relative(APP_ROOT, site.file).split(sep).join('/')} :: ${path}`;
    if (checked.has(id)) continue;
    const message = lookup(messages, path);
    // Not a message at all (helper call, or a key that lives nowhere) — locale parity owns holes.
    if (typeof message !== 'string') continue;
    checked.add(id);
    // Only templates can leak; a plain message resolves fine with no values.
    if (!PLACEHOLDER_RE.test(message)) continue;

    const translator =
      translators.get(site.namespace) ??
      translators
        .set(site.namespace, createTranslator({ locale: 'en', messages: messages as never, namespace: site.namespace }))
        .get(site.namespace)!;

    // The runtime proof: real translator, real catalog, called exactly as the screen calls it.
    if ((translator as unknown as (key: string) => string)(site.key) === path) leaks.add(id);
  }
  return [...leaks].sort();
}

describe('i18n templates with an ICU placeholder never reach the screen as a key path', () => {
  it('no call site leaks a key path that the checked-in backlog does not already own', async () => {
    const leaks = await detectLeaks();
    const baseline = readFileSync(BASELINE_FILE, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    // RATCHET, not an allow-list. The frozen ~44-key list this repo already killed once went
    // green while 270 keys were missing — the difference is that BOTH directions are asserted:
    // a new leak fails, and a leak that was fixed but left in the file fails too. The baseline
    // can only shrink, so the defect class cannot come back through a newly added key.
    const added = leaks.filter((leak) => !baseline.includes(leak));
    const stale = baseline.filter((leak) => !leaks.includes(leak));

    expect(added, `NEW raw i18n key paths on screen — fix with messageTemplate(t, key), do NOT add to the baseline:\n${added.join('\n')}`).toEqual([]);
    expect(stale, `these no longer leak — delete them from ${relative(APP_ROOT, BASELINE_FILE)}:\n${stale.join('\n')}`).toEqual([]);
  });

  it('the four screens a plain user actually opens are clean', async () => {
    const leaks = await detectLeaks();
    const userFacing = leaks.filter((leak) => /settings\/(users|modules|features|labels)\/page\.tsx/.test(leak));
    expect(userFacing, `still leaking on a user-visible screen:\n${userFacing.join('\n')}`).toEqual([]);
  });

  it('degrades a missing key to readable text, never to a key path, and still substitutes a real one', async () => {
    // Direction 2 of the contract. `buildMessages` layers EN under every other locale, so a hole
    // in pl must surface English TEXT. `production.wos.actions.complete.overridePin` is the key
    // that used to reach a Polish operator as a dotted path.
    const pl = await buildMessages('pl');
    const t = createTranslator({ locale: 'pl', messages: pl as never, namespace: 'production.wos.actions.complete' });
    const degraded = (t as unknown as (key: string) => string)('overridePin');
    expect(degraded).not.toContain('production.wos');
    expect(degraded.length).toBeGreaterThan(0);

    // A template resolves correctly once its values are supplied — the fix must not break that.
    const footer = createTranslator({ locale: 'pl', messages: pl as never, namespace: 'production.changeovers.list.pagination' });
    expect(footer('showing', { shown: 25, total: 120 })).not.toContain('production.changeovers');
    expect(footer('showing', { shown: 25, total: 120 })).toContain('25');
  });
});
