import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const routePath = resolve(__dirname, '../route.ts');

describe('PostHog flags route server-only guard', () => {
  it('keeps server-only as the first import in the route source', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(routePath, 'utf8');
    const firstImport = source.match(/^\s*import\s+['"][^'"]+['"];?/m)?.[0].trim();

    expect(firstImport).toBe("import 'server-only';");
  });

  it('throws when bundled and imported under browser conditions', async () => {
    const { build } = await import('esbuild');
    const tempDir = await mkdtemp(join(tmpdir(), 'flags-server-only-'));
    const entryPath = join(tempDir, 'entry.ts');
    const outPath = join(tempDir, 'bundle.mjs');

    await writeFile(entryPath, `import ${JSON.stringify(routePath)};\n`, 'utf8');

    try {
      await build({
        entryPoints: [entryPath],
        outfile: outPath,
        bundle: true,
        format: 'esm',
        platform: 'node',
        conditions: ['browser'],
        absWorkingDir: dirname(routePath),
        external: ['node:*', 'pg', '@supabase/ssr', '@supabase/supabase-js', 'next/*'],
        logLevel: 'silent',
      });

      await expect(import(pathToFileURL(outPath).href)).rejects.toThrow(
        'This module cannot be imported from a Client Component module',
      );
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
