// tooling/eslint-rules/rules/no-direct-permissions-enum-edit.mjs
//
// T-130 — ESLint enum-lock guard for packages/rbac/src/permissions.enum.ts.
//
// Permission strings are a LOCKED contract. They must only change through the
// sanctioned codegen path (`pnpm --filter @monopilot/eslint-rules snapshot`,
// which regenerates baselines/permissions.snapshot.json) plus a PR carrying the
// `permissions-enum-update` label. This rule mechanises the gate so a hand-edit
// that bypasses snapshot regeneration is flagged at lint time.
//
// What the rule flags (message IDs match the documented contract):
//   - permissions-enum-regex-violation : an added Permission value does not match
//       ^[a-z_]+\.[a-z_]+\.[a-z_]+$ (three dot-separated lowercase segments).
//   - permissions-enum-illegal-removal : a Permission member present in the locked
//       baseline snapshot is missing or its value changed in the current source
//       (i.e. removed/renamed without snapshot regeneration).
//   - permissions-enum-orphan-array    : a permission string appears in an
//       ALL_<MODULE>_PERMISSIONS array but is not a member of the parent
//       `Permission` const object.
//
// Escape hatch (conservative, per task spec): an inline `// enum-lock:allow`
// comment on (or immediately above) a member line suppresses the
// illegal-removal / regex checks for that member, so a deliberate, reviewed
// change can pass without disabling the whole rule. Additions/removals still
// require snapshot regeneration to clear the baseline diff on the next run.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PERMISSION_VALUE_REGEX = /^[a-z_]+\.[a-z_]+\.[a-z_]+$/;
const ESCAPE_HATCH = 'enum-lock:allow';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SNAPSHOT_PATH = resolve(here, '..', 'baselines', 'permissions.snapshot.json');

/** Only run the lock checks on the permissions enum source file. */
function isPermissionsEnumFile(filename) {
  return /permissions\.enum\.(t|j)sx?$/.test(filename.replace(/\\/g, '/'));
}

/** Load the locked baseline snapshot ({ members: { KEY: "value", ... } }). */
function loadSnapshot(snapshotPath) {
  try {
    const raw = readFileSync(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.members === 'object' && parsed.members
      ? parsed.members
      : {};
  } catch {
    // No snapshot yet → nothing locked; the rule is a no-op until a baseline exists.
    return null;
  }
}

/**
 * Does the member node carry the escape-hatch comment?
 * Accepts a trailing comment on the same line (even past the trailing comma) or
 * a comment on the line immediately above the member.
 */
function hasEscapeHatch(sourceCode, node) {
  const memberStartLine = node.loc.start.line;
  const memberEndLine = node.loc.end.line;
  return sourceCode.getAllComments().some((c) => {
    if (!c.value.includes(ESCAPE_HATCH)) return false;
    const cLine = c.loc.start.line;
    // Same-line trailing comment, or the line directly above the member.
    return (
      (cLine >= memberStartLine && cLine <= memberEndLine) ||
      cLine === memberStartLine - 1
    );
  });
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Lock the RBAC permission enum: changes must go through the snapshot codegen path, not hand-edits.',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          snapshotPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      'permissions-enum-regex-violation':
        "Permission value '{{value}}' must match ^[a-z_]+.[a-z_]+.[a-z_]+$ (three dot-separated lowercase segments).",
      'permissions-enum-illegal-removal':
        "Locked permission '{{key}}' was removed or changed. Edit via the snapshot codegen path (pnpm --filter @monopilot/eslint-rules snapshot) and label the PR 'permissions-enum-update'.",
      'permissions-enum-orphan-array':
        "Permission string '{{value}}' appears in an ALL_*_PERMISSIONS array but is not a member of the parent Permission const.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isPermissionsEnumFile(filename)) {
      return {};
    }

    const options = context.options?.[0] ?? {};
    const snapshotPath = options.snapshotPath
      ? resolve(dirname(filename), options.snapshotPath)
      : DEFAULT_SNAPSHOT_PATH;
    const baseline = loadSnapshot(snapshotPath);

    const sourceCode = context.sourceCode ?? context.getSourceCode();

    // Collected during traversal.
    /** @type {Map<string,{value:string,node:any}>} key -> member */
    const currentMembers = new Map();
    /** @type {Set<string>} all string values present in the Permission const */
    const permissionValues = new Set();
    /** @type {Array<{value:string,node:any}>} strings used inside ALL_*_PERMISSIONS arrays */
    const arrayMemberRefs = [];

    function recordPermissionConst(objExpr) {
      for (const prop of objExpr.properties) {
        if (prop.type !== 'Property') continue;
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : prop.key.type === 'Literal'
              ? String(prop.key.value)
              : null;
        if (!key) continue;
        if (prop.value.type !== 'Literal' || typeof prop.value.value !== 'string') continue;
        const value = prop.value.value;
        currentMembers.set(key, { value, node: prop });
        permissionValues.add(value);
      }
    }

    return {
      // `export const Permission = { ... } as const;`
      'VariableDeclarator[id.name="Permission"]'(node) {
        let init = node.init;
        if (init && init.type === 'TSAsExpression') init = init.expression;
        if (init && init.type === 'ObjectExpression') {
          recordPermissionConst(init);
        }
      },

      // `export const ALL_<MODULE>_PERMISSIONS = [ ... ]` — collect member-reference values.
      'VariableDeclarator[id.name=/^ALL_[A-Z0-9_]+_PERMISSIONS$/]'(node) {
        let init = node.init;
        if (init && init.type === 'TSAsExpression') init = init.expression;
        if (!init || init.type !== 'ArrayExpression') return;
        for (const el of init.elements) {
          if (!el) continue;
          // Permission.FOO references — resolved against the const at end of pass.
          if (
            el.type === 'MemberExpression' &&
            el.object.type === 'Identifier' &&
            el.object.name === 'Permission' &&
            el.property.type === 'Identifier'
          ) {
            arrayMemberRefs.push({ key: el.property.name, value: null, node: el });
          } else if (el.type === 'Literal' && typeof el.value === 'string') {
            arrayMemberRefs.push({ key: null, value: el.value, node: el });
          }
        }
      },

      'Program:exit'() {
        // 1. Regex check on ADDED member values only. Members already present in
        //    the locked baseline are grandfathered (the baseline is the source of
        //    truth for legacy two-segment strings like 'fg.create'/'ref.edit');
        //    re-validating them would flag the existing, sanctioned contract.
        //    When no baseline exists yet, every member is treated as "added".
        for (const [key, { value, node }] of currentMembers) {
          const isExistingLocked = baseline && baseline[key] === value;
          if (isExistingLocked) continue;
          if (!PERMISSION_VALUE_REGEX.test(value)) {
            if (hasEscapeHatch(sourceCode, node)) continue;
            context.report({
              node,
              messageId: 'permissions-enum-regex-violation',
              data: { value, key },
            });
          }
        }

        // 2. Illegal removal / mutation vs locked baseline.
        if (baseline) {
          for (const [key, lockedValue] of Object.entries(baseline)) {
            const present = currentMembers.get(key);
            if (!present || present.value !== lockedValue) {
              // Escape hatch can only be attached if the member still exists.
              if (present && hasEscapeHatch(sourceCode, present.node)) continue;
              context.report({
                node: present?.node ?? context.sourceCode?.ast ?? sourceCode.ast,
                messageId: 'permissions-enum-illegal-removal',
                data: { key, value: lockedValue },
              });
            }
          }
        }

        // 3. Orphan array entries — string in ALL_*_PERMISSIONS but not in Permission const.
        for (const ref of arrayMemberRefs) {
          if (ref.key !== null) {
            // Permission.FOO reference → must exist as a key in the const.
            if (!currentMembers.has(ref.key)) {
              context.report({
                node: ref.node,
                messageId: 'permissions-enum-orphan-array',
                data: { value: ref.key },
              });
            }
          } else if (ref.value !== null) {
            if (!permissionValues.has(ref.value)) {
              context.report({
                node: ref.node,
                messageId: 'permissions-enum-orphan-array',
                data: { value: ref.value },
              });
            }
          }
        }
      },
    };
  },
};

export default rule;
