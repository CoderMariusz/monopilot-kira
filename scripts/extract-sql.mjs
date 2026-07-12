// Emit `PREPARE _pcN AS <sql>;` for each SQL template literal in given files.
import { readFileSync } from 'node:fs';
let idx = 0;
for (const f of process.argv.slice(2)) {
  let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const re = /`([^`]*)`/g; let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    if (/^\s*(with|select|insert|update|delete)\b/i.test(body) &&
        !/\$\{/.test(body) && /\$\d|\bfrom\b|\binto\b|\bset\b/i.test(body)) {
      idx++;
      console.log(`-- [${idx}] ${f.split('/').slice(-1)[0]}`);
      console.log(`PREPARE _pc${idx} AS ${body};`);
    }
  }
}
