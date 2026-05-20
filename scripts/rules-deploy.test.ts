import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = resolve(__dirname, 'rules-deploy.ts');
const repoRulesDir = resolve(__dirname, '..', 'rules');
const repoSchemasDir = resolve(repoRulesDir, '_schemas');
const TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE = 'technical_product_spec_approval_gate_v1';
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
  inTxn: boolean;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('rules-deploy CI script (T-026)', () => {
  it('rules/ scope artifact: repo contains rules/.gitkeep so the CI invocation has a source path', () => {
    const gitkeep = resolve(__dirname, '..', 'rules', '.gitkeep');
    expect(existsSync(gitkeep), 'rules/.gitkeep must exist (T-026 scope file)').toBe(true);
  });

  it('T-123: deploys the active P1 technical product spec approval gate seed and does not bump unchanged JSON', async () => {
    const deployRules = await loadDeployRules();
    const client = makeClient([]);

    const first = await deployRules({
      rulesDir: repoRulesDir,
      schemasDir: repoSchemasDir,
      deployRef: DEPLOY_REF,
      deployedBy: DEPLOYED_BY,
      orgId: ORG_ID,
      client,
    });

    expect(first).toMatchObject({ ok: true });
    const firstData = (first as { ok: true; data: { inserted: number; updated: number; skipped: number; eventsEmitted: number } }).data;
    expect(firstData.inserted, 'T-123 seed deploy must insert the technical product-spec approval gate rule').toBeGreaterThanOrEqual(1);
    expect(firstData.eventsEmitted, 'seed deploy must emit a rule.deployed outbox event for the gate rule').toBeGreaterThanOrEqual(1);

    const seeded = client.ruleDefinitions.find((row) => row.rule_code === TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE);
    expect(seeded, 'technical_product_spec_approval_gate_v1 must be present in deployed rule_definitions rows').toMatchObject({
      rule_code: TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE,
      rule_type: 'gate',
      tier: 'L1',
      version: 1,
    });
    expect(seeded?.active_to, 'newly seeded gate must be active').toBeNull();
    expect(seeded?.definition_json).toMatchObject({
      priority: 'P1',
      metadata: expect.objectContaining({
        policy_table: 'org_authorization_policies',
        approval_gate_rule_code: TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE,
      }),
      invariants: expect.objectContaining({
        requires_new_version: true,
        required_approval: 'Technical',
        before_factory_use: true,
        require_segregation_of_duties: true,
        variants_may_disable_gate: false,
        imports_may_disable_gate: false,
      }),
    });

    const second = await deployRules({
      rulesDir: repoRulesDir,
      schemasDir: repoSchemasDir,
      deployRef: `${DEPLOY_REF}-second-run`,
      deployedBy: DEPLOYED_BY,
      orgId: ORG_ID,
      client,
    });

    expect(second).toMatchObject({ ok: true });
    const gateRows = client.ruleDefinitions.filter((row) => row.rule_code === TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE);
    expect(gateRows, 'unchanged gate JSON must be idempotent and not create v2').toHaveLength(1);
    expect(gateRows[0]?.version).toBe(1);
    expect(client.outboxRows.filter((row) => row.payload.rule_code === TECHNICAL_PRODUCT_SPEC_APPROVAL_GATE)).toHaveLength(1);
  });

  it('V-SET-14: rejects a rule with no matching rules/_schemas/<rule_type>.schema.json before DB writes', async () => {
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

  it('JSON schema: enum constraint is enforced', async () => {
    const rule = makeGateRule({ definition_json: { gate: 'bogus', threshold: 5 } });
    const fixture = await makeFixtureTree([rule], {
      gate: {
        type: 'object',
        required: ['gate', 'threshold'],
        additionalProperties: false,
        properties: {
          gate: { type: 'string', enum: ['allergen', 'temperature'] },
          threshold: { type: 'number', minimum: 0 },
        },
      },
    });
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

    expect(result).toMatchObject({ ok: false, error: 'schema_invalid' });
    expect(client.ruleDefinitions, 'invalid enum value must not insert rule_definitions').toHaveLength(0);
    expect(client.outboxRows).toEqual([]);
  });

  it('JSON schema: string pattern constraint is enforced', async () => {
    const rule = makeGateRule({ definition_json: { gate: 'allergen', threshold: 5, code: 'lowercase' } });
    const fixture = await makeFixtureTree([rule], {
      gate: {
        type: 'object',
        required: ['gate', 'threshold', 'code'],
        additionalProperties: false,
        properties: {
          gate: { const: 'allergen' },
          threshold: { type: 'number', minimum: 0 },
          code: { type: 'string', pattern: '^[A-Z]{3}$' },
        },
      },
    });
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

    expect(result).toMatchObject({ ok: false, error: 'schema_invalid' });
    expect(client.ruleDefinitions).toHaveLength(0);
  });

  it('JSON schema: oneOf constraint is enforced', async () => {
    const rule = makeGateRule({ definition_json: { kind: 'unknown', value: 1 } });
    const fixture = await makeFixtureTree([rule], {
      gate: {
        type: 'object',
        oneOf: [
          { required: ['kind', 'allergen'], properties: { kind: { const: 'allergen' } } },
          { required: ['kind', 'temperature'], properties: { kind: { const: 'temperature' } } },
        ],
      },
    });
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

    expect(result).toMatchObject({ ok: false, error: 'schema_invalid' });
    expect(client.ruleDefinitions).toHaveLength(0);
  });

  it('JSON schema: array items constraint is enforced', async () => {
    const rule = makeGateRule({
      rule_code: 'allergen_cascade_v1',
      rule_type: 'cascading',
      definition_json: { allergens: ['milk', 42, 'soy'] },
    });
    const fixture = await makeFixtureTree([rule], {
      cascading: {
        type: 'object',
        required: ['allergens'],
        additionalProperties: false,
        properties: {
          allergens: { type: 'array', items: { type: 'string' } },
        },
      },
    });
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

    expect(result).toMatchObject({ ok: false, error: 'schema_invalid' });
    expect(client.ruleDefinitions).toHaveLength(0);
  });

  it('creates next version, emits outbox atomically with insert in same transaction', async () => {
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

    const newVersion = client.ruleDefinitions.find(
      (row) => row.rule_code === changedRule.rule_code && row.version === 3,
    );
    expect(newVersion, 'changed rule must be inserted as prior version + 1').toMatchObject({
      rule_code: changedRule.rule_code,
      rule_type: 'gate',
      version: 3,
      definition_json: changedRule.definition_json,
      deploy_ref: DEPLOY_REF,
      deployed_by: DEPLOYED_BY,
    });
    expect(client.ruleDefinitions.find((row) => row.id === 'rule-existing-v2')?.active_to, 'prior active version must be closed').toEqual(
      expect.any(String),
    );
    expect(client.outboxRows).toEqual([
      expect.objectContaining({
        event_type: 'rule.deployed',
        org_id: ORG_ID,
        payload: expect.objectContaining({
          rule_code: changedRule.rule_code,
          from_version: 2,
          to_version: 3,
          deploy_ref: DEPLOY_REF,
        }),
      }),
    ]);

    // The insert + outbox emit must happen inside the same BEGIN..COMMIT.
    const txn = transactionSlice(client.calls);
    const insertedInTxn = txn.some((sql) => /insert\s+into\s+public\.rule_definitions/i.test(sql));
    const outboxInTxn = txn.some((sql) => /insert\s+into\s+public\.outbox_events/i.test(sql));
    expect(insertedInTxn, 'rule_definitions insert must run inside a transaction').toBe(true);
    expect(outboxInTxn, 'outbox emit must run inside the SAME transaction as the rule_definitions insert').toBe(true);
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
    expect(client.ruleDefinitions).toHaveLength(1);
    expect(client.ruleDefinitions[0]?.version).toBe(2);
    expect(mutationSql(client)).toEqual([]);
    expect(client.outboxRows).toEqual([]);
  });

  it('rejects zero-UUID for deployedBy (no audit-poisoning fallback allowed)', async () => {
    const rule = makeGateRule({ rule_code: 'allergen_changeover_gate_v1' });
    const fixture = await makeFixtureTree([rule], { gate: gateSchema() });
    const client = makeClient([]);
    const deployRules = await loadDeployRules();

    const result = await deployRules({
      rulesDir: fixture.rulesDir,
      schemasDir: fixture.schemasDir,
      deployRef: DEPLOY_REF,
      deployedBy: '00000000-0000-0000-0000-000000000000',
      orgId: ORG_ID,
      client,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(client.ruleDefinitions, 'zero-UUID deployer must not insert rule_definitions').toHaveLength(0);
    expect(client.outboxRows).toEqual([]);
  });

  it('rejects empty/missing deployedBy (no fallback to a synthetic UUID)', async () => {
    const rule = makeGateRule({ rule_code: 'allergen_changeover_gate_v1' });
    const fixture = await makeFixtureTree([rule], { gate: gateSchema() });
    const client = makeClient([]);
    const deployRules = await loadDeployRules();

    const result = await deployRules({
      rulesDir: fixture.rulesDir,
      schemasDir: fixture.schemasDir,
      deployRef: DEPLOY_REF,
      deployedBy: '',
      orgId: ORG_ID,
      client,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(client.ruleDefinitions).toHaveLength(0);
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
  const root = join(tmpdir(), `rules-deploy-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
    inTxn: false,
    query: async (sql: string, params: unknown[] = []) => {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase().trim();
      const ruleCode = params.find((param) => typeof param === 'string' && param.endsWith('_v1')) as string | undefined;

      if (normalized === 'begin') {
        client.inTxn = true;
        return { rows: [], rowCount: 0 };
      }
      if (normalized === 'commit' || normalized === 'rollback') {
        client.inTxn = false;
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from') && normalized.includes('rule_definitions')) {
        const rows = client.ruleDefinitions
          .filter((row) => !ruleCode || row.rule_code === ruleCode)
          .filter((row) => row.active_to === null)
          .sort((a, b) => b.version - a.version);
        return { rows: rows.slice(0, 1), rowCount: rows.length > 0 ? 1 : 0 };
      }

      if (normalized.includes('update') && normalized.includes('rule_definitions') && normalized.includes('active_to')) {
        const id = params.find((param) => typeof param === 'string' && param.startsWith('rule-existing')) as string | undefined;
        const target =
          client.ruleDefinitions.find((row) => row.id === id) ??
          client.ruleDefinitions.find((row) => row.rule_code === ruleCode && row.active_to === null);
        if (target) target.active_to = new Date().toISOString();
        return { rows: target ? [target] : [], rowCount: target ? 1 : 0 };
      }

      if (normalized.includes('insert') && normalized.includes('rule_definitions')) {
        // Insert SQL is invoked with positional params:
        //   [$1=orgId, $2=ruleJsonObj, $3=version, $4=deployedBy, $5=deployRef]
        const payload = params.find(isRuleFixturePayload);
        const insertedRuleCode = payload?.rule_code ?? ruleCode ?? 'unknown_rule_v1';
        const prior = client.ruleDefinitions
          .filter((row) => row.rule_code === insertedRuleCode)
          .sort((a, b) => b.version - a.version)[0];
        const nextVersion = prior ? prior.version + 1 : 1;
        const versionParam = typeof params[2] === 'number' ? (params[2] as number) : nextVersion;
        const deployedBy = typeof params[3] === 'string' ? (params[3] as string) : DEPLOYED_BY;
        const deployRef = typeof params[4] === 'string' ? (params[4] as string) : DEPLOY_REF;
        const row: RuleDefinitionRow = {
          id: `rule-inserted-v${versionParam}`,
          org_id: ORG_ID,
          rule_code: insertedRuleCode,
          rule_type: payload?.rule_type ?? 'gate',
          tier: payload?.tier ?? 'L1',
          definition_json: payload?.definition_json ?? {},
          version: versionParam,
          active_from: new Date().toISOString(),
          active_to: null,
          deployed_by: deployedBy,
          deploy_ref: deployRef,
        };
        client.ruleDefinitions.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (normalized.includes('insert') && normalized.includes('outbox')) {
        // Reconstruct outbox row from positional params: [orgId, eventType, aggregateId, payload].
        const eventType = (params.find((p) => p === 'rule.deployed') as string | undefined) ?? 'rule.deployed';
        const aggregateId = params.find((p, i) => typeof p === 'string' && i > 0 && /^rule-inserted/.test(p)) as
          | string
          | undefined;
        const payloadParam = params.find((p) => p && typeof p === 'object' && !Array.isArray(p)) as
          | Record<string, unknown>
          | undefined;
        const outbox: OutboxRow = {
          event_type: eventType,
          org_id: ORG_ID,
          aggregate_id: aggregateId,
          payload: payloadParam ?? {},
        };
        client.outboxRows.push(outbox);
        return { rows: [outbox], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function isRuleFixturePayload(value: unknown): value is RuleFixture {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).rule_code === 'string' &&
    typeof (value as Record<string, unknown>).rule_type === 'string' &&
    typeof (value as Record<string, unknown>).definition_json === 'object');
}

function mutationSql(client: FakeRuleDeployClient): string[] {
  return client.calls
    .map((call) => call.sql.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((sql) => /^(insert|update|delete)\b/.test(sql) && (sql.includes('rule_definitions') || sql.includes('outbox')));
}

/** Returns SQL strings that appear between the first BEGIN and the first COMMIT/ROLLBACK. */
function transactionSlice(calls: QueryCall[]): string[] {
  const normalized = calls.map((c) => c.sql.replace(/\s+/g, ' ').trim().toLowerCase());
  const begin = normalized.indexOf('begin');
  if (begin < 0) return [];
  const endCommit = normalized.indexOf('commit', begin);
  const endRollback = normalized.indexOf('rollback', begin);
  const end = [endCommit, endRollback].filter((i) => i > -1).sort((a, b) => a - b)[0] ?? normalized.length;
  return normalized.slice(begin + 1, end);
}
