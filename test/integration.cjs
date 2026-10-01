// Fully isolated database/server. Never points at the developer or production database.
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { io } = require('socket.io-client');
const { PrismaClient } = require('@prisma/client');
const directory = mkdtempSync(join(tmpdir(), 'respace-integration-'));
const database = join(directory, 'test.db');
writeFileSync(database, '');
const port = 4100,
  base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  DATABASE_URL: `file:${database}`,
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
  PORT: String(port),
  APP_ORIGIN: base,
  NODE_ENV: 'test',
  ADMIN_EMAIL: '',
};
let server, db;
const peers = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(path, method = 'GET', body, token, status = 200) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(
    res.status,
    status,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return { data, res };
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(base, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    peers.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
function emit(s, event, data) {
  return new Promise((resolve, reject) =>
    s
      .timeout(5000)
      .emit(event, data, (err, result) =>
        err ? reject(err) : resolve(result),
      ),
  );
}
function event(s, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off(name, cb);
      reject(new Error(`Timeout: ${name}`));
    }, 5000);
    function cb(data) {
      clearTimeout(timer);
      resolve(data);
    }
    s.once(name, cb);
  });
}
async function main() {
  execFileSync(
    'node',
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env, stdio: 'pipe' },
  );
  execFileSync('node', ['scripts/seed.cjs'], { env, stdio: 'pipe' });
  db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  let logs = '';
  server = spawn('node', ['dist/main.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (b) => (logs += b));
  server.stderr.on('data', (b) => (logs += b));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/health')).ok) break;
    } catch {}
    await delay(100);
    if (i === 99) throw new Error(logs);
  }
  await request('/space/rooms', 'GET', undefined, undefined, 401);
  await request(
    '/auth/register',
    'POST',
    { name: 'X', email: 'bad', password: 'short' },
    undefined,
    400,
  );
  const password = 'a-strong-test-password';
  const a = await request(
    '/auth/register',
    'POST',
    { name: 'Alice', email: 'alice@example.test', password },
    undefined,
    201,
  );
  const b = (
    await request(
      '/auth/register',
      'POST',
      { name: 'Bob', email: 'bob@example.test', password },
      undefined,
      201,
    )
  ).data;
  const alice = a.data;
  assert(!('password' in alice.user));
  assert.match(a.res.headers.get('set-cookie'), /HttpOnly/i);
  const stored = await db.user.findUnique({ where: { id: alice.user.id } });
  assert.match(stored.password, /^\$2/);
  assert.notEqual(stored.password, password);
  const cookie = a.res.headers.get('set-cookie').split(';')[0];
  assert.equal(
    (await fetch(base + '/auth/me', { headers: { Cookie: cookie } })).status,
    200,
  );
  await request(
    '/auth/register',
    'POST',
    { name: 'Alice', email: 'alice@example.test', password },
    undefined,
    409,
  );
  await request(
    '/auth/login',
    'POST',
    { email: 'alice@example.test', password: 'incorrect' },
    undefined,
    401,
  );
  await request('/space/admin', 'GET', undefined, alice.token, 403);
  await request(
    '/space/profile',
    'PATCH',
    { displayName: 'Alice updated', avatar: 'plum', status: 'こんにちは' },
    alice.token,
  );
  assert.equal(
    (await request('/auth/me', 'GET', undefined, alice.token)).data.profile
      .avatar,
    'plum',
  );
  const wrongOrigin = await fetch(base + '/space/profile', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${alice.token}`,
      'Content-Type': 'application/json',
      Origin: 'https://evil.test',
    },
    body: JSON.stringify({ displayName: 'attack', avatar: 'mint', status: '' }),
  });
  assert.equal(wrongOrigin.status, 403);
  const s1 = await connect(alice.token),
    s2 = await connect(b.token);
  let snap = await emit(s1, 'room:join', 'lobby');
  assert.equal(snap.ok, true);
  assert.equal(snap.data.players.length, 1);
  const entered = event(s1, 'players');
  snap = await emit(s2, 'room:join', 'lobby');
  assert.equal(snap.data.players.length, 2);
  assert.equal((await entered).length, 2);
  let lastX = snap.data.players.find((p) => p.id === alice.user.id).x;
  await delay(60);
  const movement = event(s2, 'world:frame');
  const moved = await emit(s1, 'player:move', { dx: 1, dy: 0 });
  assert.equal(moved.ok, true);
  assert(moved.data.x > lastX);
  assert(moved.data.x - lastX <= 15);
  assert(
    (await movement).positions.some(
      (p) => p.id === alice.user.id && p.x > lastX,
    ),
  );
  assert.equal(
    (await emit(s1, 'player:move', { dx: 100000, dy: 0 })).ok,
    false,
  );
  const payload = '<img src=x onerror=alert(1)> test';
  const received = event(s2, 'chat:message');
  assert.equal(
    (await emit(s1, 'chat:send', { text: payload, scope: 'room' })).ok,
    true,
  );
  assert.equal((await received).text, payload);
  assert.equal(
    (await emit(s1, 'chat:send', { text: 'x'.repeat(501), scope: 'room' })).ok,
    false,
  );
  let leaked = false;
  s2.on('chat:message', (m) => {
    if (m.text === 'private-room-check') leaked = true;
  });
  await emit(s2, 'room:join', 'classroom');
  await emit(s1, 'chat:send', { text: 'private-room-check', scope: 'room' });
  await delay(150);
  assert.equal(leaked, false);
  await delay(1100);
  snap = await emit(s2, 'room:join', 'lobby');
  assert(snap.data.messages.some((m) => m.text === payload));
  const near = event(s2, 'chat:message');
  await emit(s1, 'chat:send', { text: 'nearby hello', scope: 'nearby' });
  assert.equal((await near).scope, 'nearby');
  assert.equal(await db.message.count({ where: { text: 'nearby hello' } }), 0);
  await emit(s1, 'room:join', 'consultation');
  await emit(s1, 'chat:send', { text: 'not retained', scope: 'room' });
  assert.equal(await db.message.count({ where: { text: 'not retained' } }), 0);
  const flood = await Promise.all(
    Array.from({ length: 12 }, () =>
      emit(s1, 'chat:send', { text: 'flood test', scope: 'room' }),
    ),
  );
  assert(flood.some((r) => !r.ok));
  s2.disconnect();
  await delay(100);
  const s3 = await connect(b.token);
  snap = await emit(s3, 'room:join', 'lobby');
  assert(snap.data.players.some((p) => p.id === b.user.id));
  await request(
    '/space/reports',
    'POST',
    { targetId: b.user.id, reason: 'test moderation' },
    alice.token,
    201,
  );
  await db.user.update({
    where: { id: alice.user.id },
    data: { role: 'ADMIN' },
  });
  assert.equal(
    (await request('/space/admin', 'GET', undefined, alice.token)).data.reports
      .length,
    1,
  );
  const created = (
    await request(
      '/space/admin/rooms',
      'POST',
      {
        name: 'Test room',
        description: 'Test',
        theme: 'break',
        capacity: 5,
        active: true,
      },
      alice.token,
      201,
    )
  ).data;
  assert(created.id);
  const banned = event(s3, 'session:ended');
  await request(
    `/space/admin/users/${b.user.id}`,
    'POST',
    { action: 'ban' },
    alice.token,
    201,
  );
  assert.match(await banned, /管理者/);
  await request(
    '/auth/login',
    'POST',
    { email: 'bob@example.test', password },
    undefined,
    401,
  );
  await request(
    `/space/admin/users/${b.user.id}`,
    'POST',
    { action: 'unban' },
    alice.token,
    201,
  );
  const bob = (
    await request(
      '/auth/login',
      'POST',
      { email: 'bob@example.test', password },
      undefined,
      201,
    )
  ).data;
  await request('/auth/logout', 'POST', {}, bob.token, 201);
  await request('/auth/me', 'GET', undefined, bob.token, 401);
  const bobAgain = (
    await request(
      '/auth/login',
      'POST',
      { email: 'bob@example.test', password },
      undefined,
      201,
    )
  ).data;
  // Verify preserved SNS APIs and no sensitive fields in follow responses.
  const post = (
    await request(
      '/posts',
      'POST',
      { title: 'Hello', content: 'Legacy still works' },
      alice.token,
      201,
    )
  ).data;
  await request(
    `/posts/${post.id}/comments`,
    'POST',
    { content: 'Comment' },
    bobAgain.token,
    201,
  );
  await request(`/follow/${alice.user.id}`, 'POST', {}, bobAgain.token, 201);
  assert(
    !JSON.stringify(
      (
        await request(
          `/follow/following/${b.user.id}`,
          'GET',
          undefined,
          bobAgain.token,
        )
      ).data,
    ).includes('password'),
  );
  await request(`/posts/${post.id}`, 'DELETE', undefined, alice.token);
  await request(
    '/auth/account',
    'DELETE',
    { password: 'wrong' },
    bobAgain.token,
    401,
  );
  await request('/auth/account', 'DELETE', { password }, bobAgain.token);
  assert.equal(await db.user.count({ where: { id: b.user.id } }), 0);
  await request('/auth/me', 'GET', undefined, bobAgain.token, 401);
  await request('/auth/account', 'DELETE', { password }, alice.token);
  assert.equal(await db.message.count({ where: { userId: alice.user.id } }), 0);
  console.info(
    'PASS: registration, hashing, cookie and bearer sessions, authorization, CSRF origin, profile persistence, 2-user presence/movement, invalid movement, chat/XSS payload, room isolation, history, nearby chat, consultation privacy, rate limit, reconnect, reports, admin rooms, ban/unban, logout invalidation, legacy SNS, account deletion.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const s of peers) s.disconnect();
    if (server) {
      server.kill('SIGTERM');
      await new Promise((resolve) => server.once('exit', resolve));
    }
    if (db) await db.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  });
