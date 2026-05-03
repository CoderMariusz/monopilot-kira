import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';

type NextServerProcess = ReturnType<typeof spawn>;

const host = '127.0.0.1';
const port = Number(process.env.E2E_PORT ?? '3001');
const url = `http://${host}:${port}/`;

let server: NextServerProcess | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  const timeoutMs = 30_000;
  const start = Date.now();
  let lastStatus: number | null = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      lastStatus = response.status;
      if (response.status === 200) {
        return;
      }
    } catch {
      // Server might not be accepting connections yet.
    }

    await sleep(250);
  }

  throw new Error(
    `Next.js dev server did not return HTTP 200 at ${url} in ${timeoutMs}ms; last status was ${lastStatus ?? 'unavailable'}`
  );
};

beforeAll(async () => {
  server = spawn('pnpm', ['dev', '--hostname', host, '--port', String(port)], {
    env: {
      ...process.env,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });

  await waitForServer();
}, 60_000);


afterAll(async () => {
  if (server) {
    server.kill('SIGINT');
    await sleep(500);
  }
});

describe('smoke', () => {
  it('GET / returns HTTP 200', async () => {
    const response = await fetch(url);
    expect(response.status).toBe(200);
  });
});
