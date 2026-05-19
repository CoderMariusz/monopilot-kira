import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const RULE_TYPES = ['cascading', 'conditional', 'gate', 'workflow'] as const;
const TIERS = ['L1', 'L2', 'L3', 'L4'] as const;

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
  | { ok: false; error: 'invalid_input' | 'schema_missing' | 'schema_invalid' | 'persistence_failed'; details?: Record<string, unknown> };

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

    const schema = await readJson(schemaPath);
    const validation = validateJsonSchema(rule.definition_json, schema as JsonSchema);
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

    const now = new Date().toISOString();
    const fromVersion = active?.version ?? null;
    const toVersion = (active?.version ?? 0) + 1;

    try {
      await input.client.query('begin');
      if (active) {
        await input.client.query(
          `update public.rule_definitions
              set active_to = $1::timestamptz
            where id = $2 and org_id = $3::uuid and active_to is null`,
          [now, active.id, input.orgId],
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
      const insertedRow = (inserted.rows[0] ?? { id: null }) as Partial<RuleDefinitionRow>;
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
        [input.orgId, 'rule.deployed', insertedRow.id ?? null, eventPayload],
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
  if (schema.const !== undefined && !deepEqual(value, schema.const)) return `${path} must equal schema const`;
  if (typeof schema.type === 'string' && !matchesJsonType(value, schema.type)) return `${path} must be ${schema.type}`;

  if (schema.type === 'object') {
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
        const nested = validateSchemaAt(value[key], propertySchema, `${path}.${key}`);
        if (nested) return nested;
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} must be >= ${schema.minimum}`;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} must be <= ${schema.maximum}`;
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
    const result = await deployRules({
      rulesDir: process.env.RULES_DIR ?? join(process.cwd(), 'rules'),
      schemasDir: process.env.RULE_SCHEMAS_DIR,
      deployRef: process.env.DEPLOY_REF ?? process.env.GITHUB_SHA ?? 'local',
      deployedBy: process.env.DEPLOYED_BY ?? process.env.CI_USER_ID ?? '00000000-0000-0000-0000-000000000000',
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
