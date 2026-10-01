const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'respace-browser-'));
const file = join(dir, 'browser.db');
writeFileSync(file, '');
const env = {
  ...process.env,
  DATABASE_URL: `file:${file}`,
  JWT_SECRET: 'browser-test-only-secret-with-32-characters',
  APP_ORIGIN: 'http://127.0.0.1:4200',
  PORT: '4200',
  NODE_ENV: 'test',
  ADMIN_EMAIL: '',
};
execFileSync(
  'node',
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { env, stdio: 'pipe' },
);
execFileSync('node', ['scripts/seed.cjs'], { env, stdio: 'pipe' });
const server = spawn('node', ['dist/main.js'], { env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.kill(signal));
server.on('exit', (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code || 0);
});
