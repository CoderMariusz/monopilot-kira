import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = resolve(__dirname, 'rules-deploy.ts');
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const DEPLOYED_BY = '22222222-2222-4222-8222-222222222222';
const DEPLOY_REF = 'git-sha-red-fixture';

type RuleFixture = {
  rule_code: string;
  rule_type: 'cascading' | 'conditional' | 'gate' | 'workflow';
  tier: 'L1' | 'L2' | 'L3' | 'L4';
  org_id?: string;
  definition_json: Record<string, unknown>;
};

type DeployRules = (input: {
  rulesDir: string;
  schemasDir: string;
  deployRef: string;
  deployedBy: string;
  orgId: string;
  client: FakeRuleDeployClient;
}) => Promise<unknown>;

type RuleDefinitionRow = {
  id: string;
  org_id: string;
  rule_code: string;
  rule_type: string;
  tier: string;
  definition_json: Record<string, unknown>;
  version: number;
  active_from: string;
  active_to: string | null;
  deployed_by: string | null;
  deploy_ref: string | null;
};

type OutboxRow = {
  event_type: string;
  org_id: string;
  aggregate_id?: string;
  payload: Record<string, unknown>;
};

type QueryCall = { sql: string; params: unknown[] };

type FakeRuleDeployClient = {
  calls: QueryCall[];
  ruleDefinitions: RuleDefinitionRow[];
  outboxRows: OutboxRow[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('rules-deploy CI script (TASK-000160/T-026 RED)', () => {
  it('enforces V-SET-14 by rejecting a rule_type with no matching rules/_schemas/<rule_type>.schema.json before DB writes', async () => {
    const fixture = await makeFixtureTree([
      makeGateRule({ rule_code: 'allergen_changeover_gate_v1', definition_json: { gate: 'allergen', threshold: 10 } }),
    ]);
    const client = makeClient([]);
    const deployRules = await loadDeployRules();

    const result = await deployRules({
      rulesDir: fixture.rulesDir,
      schemasDir: fixture.schemasDir,
      deployRef: DEPLOY_REF,
      deployedBy: DEPLOYED_BY,
      orgId: ORG_ID,
      client,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'schema_missing',
      details: { ruleType: 'gate', schemaPath: join(fixture.schemasDir, 'gate.schema.json') },
    });
    expect(client.calls, 'V-SET-14 failures must stop before rule_definitions/outbox writes').toHaveLength(0);
  });

  it('creates the next rule_definitions version and emits one transactional outbox event when definition_json changes', async () => {
    const changedRule = makeGateRule({
      rule_code: 'allergen_changeover_gate_v1',
      definition_json: { gate: 'allergen', threshold: 10 },
    });
    const fixture = await makeFixtureTree([changedRule], { gate: gateSchema() });
    const client = makeClient([
      existingRule('rule-existing-v2', changedRule, 2, { gate: 'allergen', threshold: 5 }),
    ]);
    const deployRules = await loadDeployRules();

    const result = await deployRules({
      rulesDir: fixture.rulesDir,
      schemasDir: fixture.schemasDir,
      deployRef: DEPLOY_REF,
      deployedBy: DEPLOYED_BY,
      orgId: ORG_ID,
      client,
    });

    expect(result).toMatchObject({ ok: true, data: { inserted: 1, updated: 0, skipped: 0, eventsEmitted: 1 } });
    const newVersion = client.ruleDefinitions.find((row) => row.rule_code === changedRule.rule_code && row.version === 3);
    expect(newVersion, 'changed rule must be inserted as prior version + 1').toMatchObject({
      rule_code: changedRule.rule_code,
      rule_type: 'gate',
      version: 3,
      definition_json: changedRule.definition_json,
      deploy_ref: DEPLOY_REF,
    });
    expect(client.ruleDefinitions.find((row) => row.id === 'rule-existing-v2')?.active_to, 'prior active version must be closed').toEqual(
      expect.any(String),
    );
    expect(client.outboxRows, 'changed deploy must emit exactly one outbox event').toEqual([
      expect.objectContaining({
        event_type: 'rule.deployed',
        org_id: ORG_ID,
        payload: expect.objectContaining({ rule_code: changedRule.rule_code, from_version: 2, to_version: 3, deploy_ref: DEPLOY_REF }),
      }),
    ]);
  });

  it('is idempotent: unchanged JSON is a NO-OP with no version bump and no outbox event', async () => {
    const unchangedRule = makeGateRule({
      rule_code: 'allergen_changeover_gate_v1',
      definition_json: { threshold: 10, gate: 'allergen' },
    });
    const fixture = await makeFixtureTree([unchangedRule], { gate: gateSchema() });
    const client = makeClient([existingRule('rule-existing-v2', unchangedRule, 2, { gate: 'allergen', threshold: 10 })]);
    const deployRules = await loadDeployRules();

    const result = await deployRules({
      rulesDir: fixture.rulesDir,
      schemasDir: fixture.schemasDir,
      deployRef: DEPLOY_REF,
      deployedBy: DEPLOYED_BY,
      orgId: ORG_ID,
      client,
    });

    expect(result).toMatchObject({ ok: true, data: { inserted: 0, updated: 0, skipped: 1, eventsEmitted: 0 } });
    expect(client.ruleDefinitions, 'unchanged JSON must not append a new rule_definitions version').toHaveLength(1);
    expect(client.ruleDefinitions[0]?.version, 'unchanged JSON must keep the existing version number').toBe(2);
    expect(mutationSql(client), 'unchanged JSON must not update/insert rule_definitions or outbox').toEqual([]);
    expect(client.outboxRows).toEqual([]);
  });
});

async function loadDeployRules(): Promise<DeployRules> {
  expect(existsSync(scriptPath), 'scripts/rules-deploy.ts must exist and export deployRules(input) for CI usage').toBe(true);
  const mod = (await import(`${pathToFileURL(scriptPath).href}?red=${Date.now()}`)) as { deployRules?: DeployRules };
  if (typeof mod.deployRules !== 'function') {
    expect.fail('scripts/rules-deploy.ts must export deployRules(input)');
  }
  return mod.deployRules;
}

function makeGateRule(overrides: Partial<RuleFixture> = {}): RuleFixture {
  return {
    rule_code: 'allergen_changeover_gate_v1',
    rule_type: 'gate',
    tier: 'L1',
    definition_json: { gate: 'allergen', threshold: 10 },
    ...overrides,
  } as RuleFixture;
}

function gateSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['gate', 'threshold'],
    additionalProperties: false,
    properties: {
      gate: { const: 'allergen' },
      threshold: { type: 'number', minimum: 0 },
    },
  };
}

async function makeFixtureTree(
  rules: RuleFixture[],
  schemas: Partial<Record<RuleFixture['rule_type'], Record<string, unknown>>> = {},
): Promise<{ root: string; rulesDir: string; schemasDir: string }> {
  const root = join(tmpdir(), `rules-deploy-red-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  tempRoots.push(root);
  const rulesDir = join(root, 'rules');
  const schemasDir = join(rulesDir, '_schemas');
  await mkdir(schemasDir, { recursive: true });
  for (const rule of rules) {
    const path = join(rulesDir, rule.rule_type, `${rule.rule_code}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(rule, null, 2)}\n`, 'utf8');
  }
  for (const [ruleType, schema] of Object.entries(schemas)) {
    await writeFile(join(schemasDir, `${ruleType}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  }
  return { root, rulesDir, schemasDir };
}

function existingRule(id: string, rule: RuleFixture, version: number, definitionJson: Record<string, unknown>): RuleDefinitionRow {
  return {
    id,
    org_id: ORG_ID,
    rule_code: rule.rule_code,
    rule_type: rule.rule_type,
    tier: rule.tier,
    definition_json: definitionJson,
    version,
    active_from: '2026-05-01T00:00:00.000Z',
    active_to: null,
    deployed_by: DEPLOYED_BY,
    deploy_ref: 'previous-ref',
  };
}

function makeClient(seedRows: RuleDefinitionRow[]): FakeRuleDeployClient {
  const client: FakeRuleDeployClient = {
    calls: [],
    ruleDefinitions: seedRows.map((row) => ({ ...row, definition_json: { ...row.definition_json } })),
    outboxRows: [],
    query: async (sql: string, params: unknown[] = []) => {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      const ruleCode = params.find((param) => typeof param === 'string' && param.endsWith('_v1')) as string | undefined;

      if (normalized.includes('from') && normalized.includes('rule_definitions')) {
        const rows = client.ruleDefinitions
          .filter((row) => !ruleCode || row.rule_code === ruleCode)
          .filter((row) => row.active_to === null)
          .sort((a, b) => b.version - a.version);
        return { rows: rows.slice(0, 1), rowCount: rows.length > 0 ? 1 : 0 };
      }

      if (normalized.includes('update') && normalized.includes('rule_definitions') && normalized.includes('active_to')) {
        const id = params.find((param) => typeof param === 'string' && param.startsWith('rule-existing')) as string | undefined;
        const target = client.ruleDefinitions.find((row) => row.id === id) ?? client.ruleDefinitions.find((row) => row.rule_code === ruleCode && row.active_to === null);
        if (target) target.active_to = new Date().toISOString();
        return { rows: target ? [target] : [], rowCount: target ? 1 : 0 };
      }

      if (normalized.includes('insert') && normalized.includes('rule_definitions')) {
        const payload = params.find(isRuleFixturePayload);
        const insertedRuleCode = payload?.rule_code ?? ruleCode ?? 'unknown_rule_v1';
        const prior = client.ruleDefinitions.filter((row) => row.rule_code === insertedRuleCode).sort((a, b) => b.version - a.version)[0];
        const nextVersion = prior ? prior.version + 1 : 1;
        const row: RuleDefinitionRow = {
          id: `rule-inserted-v${nextVersion}`,
          org_id: ORG_ID,
          rule_code: insertedRuleCode,
          rule_type: payload?.rule_type ?? 'gate',
          tier: payload?.tier ?? 'L1',
          definition_json: payload?.definition_json ?? {},
          version: nextVersion,
          active_from: new Date().toISOString(),
          active_to: null,
          deployed_by: DEPLOYED_BY,
          deploy_ref: DEPLOY_REF,
        };
        client.ruleDefinitions.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (normalized.includes('insert') && normalized.includes('outbox')) {
        const payload = (params.find(isObject) ?? {}) as Record<string, unknown>;
        const eventType = (params.find((param) => param === 'rule.deployed') as string | undefined) ?? (payload.event_type as string | undefined) ?? 'rule.deployed';
        const outbox: OutboxRow = {
          event_type: eventType,
          org_id: ORG_ID,
          aggregate_id: payload.aggregate_id as string | undefined,
          payload: (payload.payload as Record<string, unknown> | undefined) ?? payload,
        };
        client.outboxRows.push(outbox);
        return { rows: [outbox], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isRuleFixturePayload(value: unknown): value is RuleFixture {
  return isObject(value) && typeof value.rule_code === 'string' && typeof value.rule_type === 'string' && isObject(value.definition_json);
}

function mutationSql(client: FakeRuleDeployClient): string[] {
  return client.calls
    .map((call) => call.sql.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((sql) => /^(insert|update|delete)\b/.test(sql) && (sql.includes('rule_definitions') || sql.includes('outbox')));
}
