const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { io } = require('socket.io-client');
const { JwtService } = require('@nestjs/jwt');
const { fixture, delay } = require('./support/server.cjs');
let app;
const peers = [];
const event = (s, name) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: ${name}`)),
      12000,
    );
    s.once(name, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
const ack = (s, name, value) =>
  new Promise((resolve, reject) =>
    s.timeout(5000).emit(name, value, (e, r) => (e ? reject(e) : resolve(r))),
  );
async function connect(token) {
  const s = io(app.base, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: false,
    reconnectionDelay: 200,
    reconnectionDelayMax: 500,
  });
  peers.push(s);
  const ready = event(s, 'connect');
  s.connect();
  await ready;
  return s;
}
async function request(path, token, method = 'GET', body) {
  return fetch(app.base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function main() {
  app = await fixture(4301);
  const response = await request('/auth/register', null, 'POST', {
    name: 'Resilience',
    email: 'resilience@example.test',
    password: 'resilience-password',
  });
  assert.equal(response.status, 201);
  const account = await response.json();
  const s = await connect(account.token);
  assert((await ack(s, 'room:join', 'lobby')).ok);
  assert.equal((await ack(s, 'room:join', 'does-not-exist')).ok, false);
  assert(
    (
      await ack(s, 'chat:send', {
        text: 'retained after restart',
        scope: 'room',
      })
    ).ok,
  );
  // Same account in a second tab replaces the first, without duplicate avatars.
  const replaced = event(s, 'session:ended');
  const duplicate = await connect(account.token);
  assert.match(await replaced, /別のタブ/);
  assert((await ack(duplicate, 'room:join', 'lobby')).ok);
  const disconnected = event(duplicate, 'disconnect');
  await app.stop();
  await disconnected;
  const reconnected = event(duplicate, 'connect');
  await app.start();
  await reconnected;
  const joined = await ack(duplicate, 'room:join', 'lobby');
  assert(joined.ok);
  assert(joined.data.messages.some((m) => m.text === 'retained after restart'));
  assert.equal(joined.data.players.length, 1);
  assert.equal((await request('/auth/me', account.token)).status, 200);
  // A database-expired session cannot send or authenticate even with a signed JWT.
  const jwt = new JwtService({ secret: app.env.JWT_SECRET });
  const payload = jwt.verify(account.token);
  await app.db.session.update({
    where: { id: payload.sid },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await ack(duplicate, 'player:move', { dx: 1, dy: 0 })).ok,
    false,
  );
  assert.equal((await request('/auth/me', account.token)).status, 401);
  const ended = event(duplicate, 'session:ended');
  const expiredDisconnect = event(duplicate, 'disconnect');
  await ended;
  await expiredDisconnect;
  assert.equal(duplicate.connected, false);
  const login = await request('/auth/login', null, 'POST', {
    email: 'resilience@example.test',
    password: 'resilience-password',
  });
  assert.equal(login.status, 201);
  const session = await login.json();
  const active = await connect(session.token);
  assert((await ack(active, 'room:join', 'lobby')).ok);
  const loggedOut = event(active, 'session:ended');
  assert.equal(
    (await request('/auth/logout', session.token, 'POST', {})).status,
    201,
  );
  await loggedOut;
  assert.equal((await request('/auth/me', session.token)).status, 401);
  // Drop only a test fixture table to force a real database query failure.
  // Verify safe API error and server survival, then restore the empty table.
  const table = await app.db.$queryRawUnsafe(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='Report'",
  );
  await app.db.$executeRawUnsafe('DROP TABLE Report');
  const login2 = await (
    await request('/auth/login', null, 'POST', {
      email: 'resilience@example.test',
      password: 'resilience-password',
    })
  ).json();
  const failed = await request('/space/reports', login2.token, 'POST', {
    targetId: account.user.id,
    reason: 'fixture failure',
  });
  assert.equal(failed.status, 500);
  const body = await failed.text();
  assert(!body.includes('Prisma'));
  assert(!body.includes('sqlite'));
  assert.equal((await request('/health')).status, 200);
  await app.db.$executeRawUnsafe(table[0].sql);
  execFileSync('node', ['scripts/promote-admin.cjs'], {
    env: { ...app.env, ADMIN_EMAIL: 'resilience@example.test' },
    stdio: 'pipe',
  });
  assert.equal((await request('/space/admin', login2.token)).status, 200);
  console.info(
    'PASS: invalid room; duplicate login; server interruption/restart/reconnect; persisted session/history; expiry; logout revocation; real DB query failure returns safe error without crashing.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const s of peers) s.disconnect();
    if (app) await app.close();
  });
