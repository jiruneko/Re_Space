const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function fixture(port = 4300, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'respace-system-'));
  const database = join(dir, 'system.db');
  writeFileSync(database, '');
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: `file:${database}`,
    JWT_SECRET: 'isolated-system-test-secret-at-least-32-characters',
    PORT: String(port),
    APP_ORIGIN: base,
    NODE_ENV: 'test',
    ADMIN_EMAIL: '',
    ...overrides,
  };
  execFileSync(
    'node',
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env, stdio: 'pipe' },
  );
  execFileSync('node', ['scripts/seed.cjs'], { env, stdio: 'pipe' });
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  let server,
    logs = '';
  async function start() {
    server = spawn('node', ['dist/main.js'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (b) => {
      logs = (logs + b).slice(-20000);
    });
    server.stderr.on('data', (b) => {
      logs = (logs + b).slice(-20000);
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/health')).ok) return;
      } catch {}
      if (server.exitCode !== null) throw new Error(logs);
      await delay(100);
    }
    throw new Error('Server timeout: ' + logs);
  }
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const exit = new Promise((r) => server.once('exit', r));
    server.kill('SIGTERM');
    await exit;
  }
  await start();
  return {
    db,
    env,
    base,
    database,
    start,
    stop,
    pid: () => server.pid,
    logs: () => logs,
    async close() {
      await stop();
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
module.exports = { fixture, delay };
