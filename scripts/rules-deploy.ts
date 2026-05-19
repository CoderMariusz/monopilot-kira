import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const RULE_TYPES = ['cascading', 'conditional', 'gate', 'workflow'] as const;
const TIERS = ['L1', 'L2', 'L3', 'L4'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

type RuleType = (typeof RULE_TYPES)[number];
type Tier = (typeof TIERS)[number];

export type RuleJson = {
  rule_code: string;
  rule_type: RuleType;
  tier: Tier;
  org_id?: string;
  definition_json: Record<string, unknown>;
};

export type RuleDeployClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

export type DeployRulesInput = {
  rulesDir: string;
  schemasDir?: string;
  deployRef: string;
  deployedBy: string;
  orgId: string;
  client: RuleDeployClient;
};

export type DeployRulesResult =
  | { ok: true; data: { inserted: number; updated: number; skipped: number; eventsEmitted: number } }
  | {
      ok: false;
      error: 'invalid_input' | 'schema_missing' | 'schema_invalid' | 'persistence_failed';
      details?: Record<string, unknown>;
    };

type RuleDefinitionRow = {
  id: string;
  org_id: string;
  rule_code: string;
  rule_type: string;
  tier: string;
  definition_json: unknown;
  version: number;
  active_from?: string;
  active_to?: string | null;
  deployed_by?: string | null;
  deploy_ref?: string | null;
};

type JsonSchema = Record<string, unknown>;
type FailedDeployRulesResult = Extract<DeployRulesResult, { ok: false }>;

export async function deployRules(input: DeployRulesInput): Promise<DeployRulesResult> {
  // Audit-quality gate: deployedBy must be a real user UUID. We never poison
  // audit logs with a synthetic zero/nil UUID — CI deploys must carry the
  // identity of the merging user (or the deploy bot's own real UUID).
  if (typeof input.deployedBy !== 'string' || !UUID_PATTERN.test(input.deployedBy) || input.deployedBy.toLowerCase() === NIL_UUID) {
    return { ok: false, error: 'invalid_input', details: { reason: 'deployedBy must be a real (non-nil) user UUID' } };
  }
  if (typeof input.orgId !== 'string' || !UUID_PATTERN.test(input.orgId) || input.orgId.toLowerCase() === NIL_UUID) {
    return { ok: false, error: 'invalid_input', details: { reason: 'orgId must be a real (non-nil) UUID' } };
  }

  const schemasDir = input.schemasDir ?? join(input.rulesDir, '_schemas');
  const rawRules = await readRules(input.rulesDir);
  const rules: RuleJson[] = [];

  for (const rawRule of rawRules) {
    const parsed = parseRule(rawRule, input.orgId);
    if (parsed.ok === false) return parsed.result;
    rules.push(parsed.rule);
  }

  for (const rule of rules) {
    const schemaPath = join(schemasDir, `${rule.rule_type}.schema.json`);
    if (!existsSync(schemaPath)) {
      return { ok: false, error: 'schema_missing', details: { ruleType: rule.rule_type, schemaPath } };
    }

    const schema = (await readJson(schemaPath)) as JsonSchema;
    const validation = validateJsonSchema(rule.definition_json, schema);
    if (!validation.ok) {
      return {
        ok: false,
        error: 'schema_invalid',
        details: { ruleType: rule.rule_type, ruleCode: rule.rule_code, schemaPath, reason: validation.error },
      };
    }
  }

  const counters = { inserted: 0, updated: 0, skipped: 0, eventsEmitted: 0 };

  for (const rule of rules) {
    const active = await selectActiveRule(input.client, input.orgId, rule.rule_code);
    if (active && stableJson(active.definition_json) === stableJson(rule.definition_json)) {
      counters.skipped += 1;
      continue;
    }

    const fromVersion = active?.version ?? null;
    const toVersion = (active?.version ?? 0) + 1;

    try {
      await input.client.query('begin');
      if (active) {
        await input.client.query(
          `update public.rule_definitions
              set active_to = now()
            where id = $1 and org_id = $2::uuid and active_to is null`,
          [active.id, input.orgId],
        );
      }

      const inserted = await input.client.query(
        `insert into public.rule_definitions
           (org_id, rule_code, rule_type, tier, definition_json, version, deployed_by, deploy_ref)
         values ($1::uuid, ($2::jsonb ->> 'rule_code'), ($2::jsonb ->> 'rule_type'), ($2::jsonb ->> 'tier'),
                 ($2::jsonb -> 'definition_json'), $3::int, $4::uuid, $5)
         returning id, org_id, rule_code, rule_type, tier, definition_json, version, active_to, deployed_by, deploy_ref`,
        [input.orgId, rule, toVersion, input.deployedBy, input.deployRef],
      );
      const insertedId = (inserted.rows[0] as Partial<RuleDefinitionRow> | undefined)?.id ?? null;
      counters.inserted += 1;

      const eventPayload = {
        rule_code: rule.rule_code,
        rule_type: rule.rule_type,
        from_version: fromVersion,
        to_version: toVersion,
        deploy_ref: input.deployRef,
        deployed_by: input.deployedBy,
      };
      await input.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'rule', $3, $4::jsonb, 'rules-deploy-v1')`,
        [input.orgId, 'rule.deployed', insertedId, eventPayload],
      );
      counters.eventsEmitted += 1;
      await input.client.query('commit');
    } catch (error) {
      await input.client.query('rollback').catch(() => undefined);
      return {
        ok: false,
        error: 'persistence_failed',
        details: { ruleCode: rule.rule_code, reason: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  return { ok: true, data: counters };
}

async function selectActiveRule(client: RuleDeployClient, orgId: string, ruleCode: string): Promise<RuleDefinitionRow | null> {
  const result = await client.query(
    `select id, org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to, deployed_by, deploy_ref
       from public.rule_definitions
      where org_id = $1::uuid and rule_code = $2 and active_to is null
      order by version desc
      limit 1`,
    [orgId, ruleCode],
  );
  return (result.rows[0] as RuleDefinitionRow | undefined) ?? null;
}

async function readRules(rulesDir: string): Promise<unknown[]> {
  const files = await collectJsonFiles(rulesDir);
  const ruleFiles = files.filter((file) => !file.includes(`${join(rulesDir, '_schemas')}/`) && basename(file).endsWith('.json'));
  const rules: unknown[] = [];
  for (const file of ruleFiles) {
    rules.push(await readJson(file));
  }
  return rules;
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_schemas') continue;
      files.push(...(await collectJsonFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(path);
    }
  }
  return files.sort();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function parseRule(raw: unknown, orgId: string): { ok: true; rule: RuleJson } | { ok: false; result: FailedDeployRulesResult } {
  if (!isRecord(raw)) return invalid('rule JSON must be an object');
  const { rule_code, rule_type, tier, definition_json, org_id } = raw;
  if (typeof rule_code !== 'string' || rule_code.length === 0) return invalid('rule_code is required');
  if (!isRuleType(rule_type)) return invalid('rule_type is invalid');
  if (!isTier(tier)) return invalid('tier is invalid');
  if (!isRecord(definition_json)) return invalid('definition_json must be an object');
  if (org_id !== undefined && org_id !== orgId) return invalid('rule org_id must match deploy orgId');
  return { ok: true, rule: { rule_code, rule_type, tier, org_id: org_id as string | undefined, definition_json } };
}

function invalid(reason: string): { ok: false; result: FailedDeployRulesResult } {
  return { ok: false, result: { ok: false, error: 'invalid_input', details: { reason } } };
}

function validateJsonSchema(value: unknown, schema: JsonSchema): { ok: true; error?: never } | { ok: false; error: string } {
  const result = validateSchemaAt(value, schema, '$');
  return result === null ? { ok: true } : { ok: false, error: result };
}

function validateSchemaAt(value: unknown, schema: JsonSchema, path: string): string | null {
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    return `${path} must equal schema const`;
  }

  if (Array.isArray(schema.enum)) {
    const allowed = schema.enum as unknown[];
    if (!allowed.some((candidate) => deepEqual(candidate, value))) {
      return `${path} must be one of enum values`;
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.filter(isRecord) as JsonSchema[];
    const matches = branches.filter((branch) => validateSchemaAt(value, branch, path) === null);
    if (matches.length !== 1) {
      return `${path} must match exactly one branch in oneOf (matched ${matches.length})`;
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) {
      if (!isRecord(branch)) continue;
      const nested = validateSchemaAt(value, branch as JsonSchema, path);
      if (nested) return nested;
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.filter(isRecord) as JsonSchema[];
    const someMatch = branches.some((branch) => validateSchemaAt(value, branch, path) === null);
    if (!someMatch) return `${path} must match at least one branch in anyOf`;
  }

  if (typeof schema.type === 'string' && !matchesJsonType(value, schema.type)) {
    return `${path} must be ${schema.type}`;
  }

  if (schema.type === 'object' || (isRecord(value) && (schema.required || schema.properties || schema.additionalProperties !== undefined))) {
    if (!isRecord(value)) return `${path} must be object`;
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
    for (const key of required) {
      if (!(key in value)) return `${path}.${key} is required`;
    }
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) return `${path}.${key} is not allowed`;
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && isRecord(propertySchema)) {
        const nested = validateSchemaAt(value[key], propertySchema as JsonSchema, `${path}.${key}`);
        if (nested) return nested;
      }
    }
  }

  if (schema.type === 'array' || Array.isArray(value)) {
    if (!Array.isArray(value)) {
      if (schema.type === 'array') return `${path} must be array`;
    } else {
      const minItems = numberOrNull(schema.minItems);
      const maxItems = numberOrNull(schema.maxItems);
      if (minItems !== null && value.length < minItems) return `${path} must have at least ${minItems} items`;
      if (maxItems !== null && value.length > maxItems) return `${path} must have at most ${maxItems} items`;
      if (isRecord(schema.items)) {
        const itemSchema = schema.items as JsonSchema;
        for (let i = 0; i < value.length; i++) {
          const nested = validateSchemaAt(value[i], itemSchema, `${path}[${i}]`);
          if (nested) return nested;
        }
      } else if (Array.isArray(schema.items)) {
        const itemSchemas = schema.items.filter(isRecord) as JsonSchema[];
        for (let i = 0; i < Math.min(itemSchemas.length, value.length); i++) {
          const nested = validateSchemaAt(value[i], itemSchemas[i]!, `${path}[${i}]`);
          if (nested) return nested;
        }
      }
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string') {
      let pattern: RegExp | null = null;
      try {
        pattern = new RegExp(schema.pattern);
      } catch {
        return `${path} schema has an invalid regular expression pattern`;
      }
      if (pattern && !pattern.test(value)) return `${path} does not match pattern ${schema.pattern}`;
    }
    const minLength = numberOrNull(schema.minLength);
    const maxLength = numberOrNull(schema.maxLength);
    if (minLength !== null && value.length < minLength) return `${path} must be at least ${minLength} chars`;
    if (maxLength !== null && value.length > maxLength) return `${path} must be at most ${maxLength} chars`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} must be >= ${schema.minimum}`;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} must be <= ${schema.maximum}`;
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      return `${path} must be > ${schema.exclusiveMinimum}`;
    }
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      return `${path} must be < ${schema.exclusiveMaximum}`;
    }
  }

  return null;
}

function matchesJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isRuleType(value: unknown): value is RuleType {
  return typeof value === 'string' && (RULE_TYPES as readonly string[]).includes(value);
}

function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

async function cli() {
  const { Client } = (await Function('specifier', 'return import(specifier)')('pg')) as {
    Client: new (config: { connectionString?: string }) => RuleDeployClient & { connect: () => Promise<void>; end: () => Promise<void> };
  };
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // deployedBy: requires a real UUID. We deliberately do NOT default to a
    // synthetic / nil UUID here — that would let CI poison the audit log when
    // the env var is missing. Fail fast instead.
    const deployedBy = process.env.DEPLOYED_BY ?? process.env.CI_USER_ID;
    if (!deployedBy) {
      throw new Error('DEPLOYED_BY (or CI_USER_ID) env var is required; rules-deploy refuses to use a synthetic UUID.');
    }

    const result = await deployRules({
      rulesDir: process.env.RULES_DIR ?? join(process.cwd(), 'rules'),
      schemasDir: process.env.RULE_SCHEMAS_DIR,
      deployRef: process.env.DEPLOY_REF ?? process.env.GITHUB_SHA ?? 'local',
      deployedBy,
      orgId: requiredEnv('ORG_ID'),
      client,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } finally {
    await client.end();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isCliEntrypoint(): boolean {
  return process.argv[1] ? /rules-deploy\.[cm]?[tj]s$/.test(process.argv[1]) : false;
}

if (isCliEntrypoint()) {
  cli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
