import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { smokeQueries } from './smoke-queries.js';

const execFileAsync = promisify(execFile);

type DrillPhase = 'input' | 'restore' | 'migrate' | 'smoke' | 'passed';

export type SmokeResult = {
  name: string;
  passed: boolean;
  rowCount?: number;
  error?: string;
};

export type RestoreDrillReport = {
  startedAt: string;
  restoredAt?: string;
  migratedAt?: string;
  completedAt?: string;
  phase: DrillPhase;
  smokeResults: SmokeResult[];
  passed: boolean;
  reportPath?: string;
  error?: string;
};

export type RunRestoreDrillOptions = {
  dumpPath?: string;
  databaseUrl?: string;
  reportDir?: string;
};

export class RestoreDrillError extends Error {
  report: RestoreDrillReport;

  constructor(message: string, report: RestoreDrillReport) {
    super(message);
    this.name = 'RestoreDrillError';
    this.report = report;
  }
}

function repoRoot(): string {
  let current = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  return process.cwd();
}

function defaultReportDir(): string {
  return resolve(repoRoot(), 'drill-reports');
}

function reportFilename(startedAt: string): string {
  return `restore-drill-${startedAt.replace(/[:.]/g, '-')}.json`;
}

function persistReport(report: RestoreDrillReport, reportDir: string): RestoreDrillReport {
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, reportFilename(report.startedAt));
  const persisted = { ...report, reportPath };
  writeFileSync(reportPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  return persisted;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireInputs(dumpPath: string | undefined, databaseUrl: string | undefined): void {
  if (!dumpPath) throw new Error('DRILL_DUMP_PATH is required');
  if (!databaseUrl) throw new Error('DRILL_DATABASE_URL is required');
  if (!existsSync(dumpPath)) throw new Error(`DRILL_DUMP_PATH does not exist: ${dumpPath}`);
}

function assertEphemeralTarget(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  const productionHosts = (process.env['DRILL_PRODUCTION_HOSTS'] ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (productionHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`DRILL_DATABASE_URL host is marked as production: ${parsed.hostname}`);
  }

  for (const envName of ['DATABASE_URL', 'DATABASE_URL_OWNER', 'DATABASE_URL_APP']) {
    if (process.env[envName] && process.env[envName] === databaseUrl) {
      throw new Error(`DRILL_DATABASE_URL must not equal ${envName}`);
    }
  }

  if (/^(postgres|monopilot|kira|prod|production)$/i.test(databaseName)) {
    throw new Error(`DRILL_DATABASE_URL database name is not ephemeral: ${databaseName}`);
  }
}

async function restoreDump(dumpPath: string, databaseUrl: string): Promise<void> {
  const extension = extname(dumpPath).toLowerCase();
  if (extension === '.dump' || extension === '.backup') {
    await execFileAsync('pg_restore', ['--no-owner', '--no-privileges', '--dbname', databaseUrl, dumpPath]);
    return;
  }

  await execFileAsync('psql', ['--set', 'ON_ERROR_STOP=1', '--dbname', databaseUrl, '--file', dumpPath]);
}

async function migrateTarget(databaseUrl: string): Promise<void> {
  await execFileAsync('pnpm', ['--filter', '@monopilot/db', 'migrate'], {
    cwd: repoRoot(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_OWNER: databaseUrl,
    },
  });
}

async function runSmokeQueries(databaseUrl: string): Promise<SmokeResult[]> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const results: SmokeResult[] = [];
    for (const query of smokeQueries) {
      try {
        const result = await pool.query(query.sql);
        results.push({
          name: query.name,
          passed: query.assert(result.rows),
          rowCount: result.rowCount ?? undefined,
        });
      } catch (error) {
        results.push({
          name: query.name,
          passed: false,
          error: errorMessage(error),
        });
      }
    }
    return results;
  } finally {
    await pool.end();
  }
}

export async function runRestoreDrill(
  options: RunRestoreDrillOptions = {},
): Promise<RestoreDrillReport> {
  const startedAt = new Date().toISOString();
  const reportDir = options.reportDir ?? defaultReportDir();
  let report: RestoreDrillReport = {
    startedAt,
    phase: 'input',
    smokeResults: [],
    passed: false,
  };

  try {
    const dumpPath = options.dumpPath ?? process.env['DRILL_DUMP_PATH'];
    const databaseUrl = options.databaseUrl ?? process.env['DRILL_DATABASE_URL'];

    requireInputs(dumpPath, databaseUrl);
    assertEphemeralTarget(databaseUrl!);

    report.phase = 'restore';
    await restoreDump(dumpPath!, databaseUrl!);
    report.restoredAt = new Date().toISOString();

    report.phase = 'migrate';
    await migrateTarget(databaseUrl!);
    report.migratedAt = new Date().toISOString();

    report.phase = 'smoke';
    report.smokeResults = await runSmokeQueries(databaseUrl!);
    const passed = report.smokeResults.every((result) => result.passed);
    report.passed = passed;
    report.phase = passed ? 'passed' : 'smoke';
    report.completedAt = new Date().toISOString();
    report = persistReport(report, reportDir);

    if (!passed) {
      throw new RestoreDrillError('Restore drill smoke checks failed', report);
    }

    return report;
  } catch (error) {
    if (error instanceof RestoreDrillError) throw error;

    report = {
      ...report,
      completedAt: new Date().toISOString(),
      passed: false,
      error: errorMessage(error),
    };
    report = persistReport(report, reportDir);
    throw new RestoreDrillError(report.error ?? 'Restore drill failed', report);
  }
}

function printHelp(): void {
  console.log(`Usage: pnpm drill

Required environment:
  DRILL_DUMP_PATH       Path to a .sql, .dump, or .backup logical dump.
  DRILL_DATABASE_URL    Ephemeral target Postgres URL.

Optional environment:
  DRILL_PRODUCTION_HOSTS  Comma-separated hostnames that must never be targeted.

Reports are written to ./drill-reports/ by default.`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  try {
    const report = await runRestoreDrill();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (error instanceof RestoreDrillError) {
      console.error(JSON.stringify(error.report, null, 2));
      process.exitCode = 1;
      return;
    }
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
