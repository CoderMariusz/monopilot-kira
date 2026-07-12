// Extract SQL template literals from given .ts files and PREPARE each against prod.
// Usage: node prepare-check-sql.mjs <file1> <file2> ...
// Requires DBURL env (owner url, sslmode=require).
import pg from 'pg';
import { readFileSync } from 'node:fs';

const DB = process.env.DBURL;
if (!DB) { console.error('DBURL env required'); process.exit(2); }

// pull backtick-delimited blocks whose trimmed content starts with a SQL verb
function extractSql(src) {
  const out = [];
  const re = /`([^`]*)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    if (/^\s*(with|select|insert|update|delete)\b/i.test(body) && /\$\d|\bfrom\b|\binto\b|\bset\b/i.test(body)) {
      out.push(body);
    }
  }
  return out;
}

const files = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: DB.replace(/[?&]sslmode=[^&]*/,''), ssl: { rejectUnauthorized: false } });
let idx = 0, ok = 0, fail = 0;
const failures = [];
for (const f of files) {
  let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
  for (const sql of extractSql(src)) {
    idx++;
    const name = `_pc_${idx}`;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role none`).catch(()=>{});
      await client.query(`prepare ${name} as ${sql}`);
      ok++;
    } catch (e) {
      // ignore pure param-type-inference errors; report column/table/syntax errors
      const msg = e.message || String(e);
      if (/does not exist|no such|column|relation|syntax error|operator does not exist/i.test(msg)) {
        fail++; failures.push({ file: f.split('/').slice(-1)[0], msg, sql: sql.slice(0,120).replace(/\s+/g,' ') });
      }
    } finally {
      await client.query('rollback').catch(()=>{});
      client.release();
    }
  }
}
console.log(`PREPARE-checked ${idx} statements: ${ok} ok, ${fail} column/table/syntax failures`);
for (const x of failures) console.log(`\n❌ ${x.file}\n   ${x.msg}\n   SQL: ${x.sql}...`);
await pool.end();
process.exit(fail > 0 ? 1 : 0);
