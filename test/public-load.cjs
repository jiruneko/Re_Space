// Run only against a Re:Space service whose owner authorized this load test.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdirSync, writeFileSync, unlinkSync } = require('node:fs');
const { performance } = require('node:perf_hooks');
const { io } = require('socket.io-client');
const base = process.env.TEST_BASE_URL;
if (!base || new URL(base).protocol !== 'https:')
  throw new Error('TEST_BASE_URL must be the authorized HTTPS service origin');
const duration = Number(process.env.LOAD_SECONDS || 60),
  accounts = [],
  peers = [],
  moves = [],
  chats = [];
let failures = 0,
  attempts = 0,
  frames = 0,
  reconnects = 0,
  transitions = 0;
const runId = Date.now().toString(36);
const statePath = `test-results/public-load-${runId}-cleanup.json`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, token, method, body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return data;
}
const ack = (s, event, value) =>
  new Promise((resolve, reject) =>
    s
      .timeout(5000)
      .emit(event, value, (e, r) =>
        e ? reject(e) : r.ok ? resolve(r.data) : reject(new Error(r.error)),
      ),
  );
async function connect(token) {
  const s = io(base, {
    transports: ['websocket'],
    auth: { token },
    extraHeaders: { Origin: base },
    reconnection: false,
    autoConnect: false,
    timeout: 15000,
  });
  peers.push(s);
  await new Promise((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
    s.connect();
  });
  s.on('world:frame', () => frames++);
  return s;
}
function pct(a, p) {
  return Math.round(
    [...a].sort((a, b) => a - b)[
      Math.min(a.length - 1, Math.floor(a.length * p))
    ] || 0,
  );
}
async function main() {
  mkdirSync('test-results', { recursive: true });
  for (let i = 0; i < 50; i++) {
    const password = randomBytes(24).toString('base64url'),
      email = `load-${runId}-${i}@example.test`;
    const a = await api('/auth/register', null, 'POST', {
      name: `負荷試験 ${i + 1}`,
      email,
      password,
    });
    accounts.push({ email, password, token: a.token });
    writeFileSync(statePath, JSON.stringify(accounts), { mode: 0o600 });
  }
  for (const account of accounts) {
    const s = await connect(account.token);
    await ack(s, 'room:join', 'lobby');
  }
  assert.equal((await ack(peers[0], 'room:join', 'lobby')).players.length, 50);
  const start = performance.now(),
    pending = new Set();
  frames = 0;
  let tick = 0;
  const send = (socket, event, value, output) => {
    const t = performance.now();
    const work = ack(socket, event, value)
      .then(() => output.push(performance.now() - t))
      .catch(() => failures++)
      .finally(() => pending.delete(work));
    pending.add(work);
  };
  while (performance.now() - start < duration * 1000) {
    if (pending.size > 500)
      throw new Error(
        'Backpressure exceeded 10 outstanding operations per user',
      );
    const t = performance.now();
    for (let i = 0; i < 50; i++) {
      attempts++;
      send(
        peers[i],
        'player:move',
        { dx: Math.floor(tick / 30) % 2 ? -1 : 1, dy: i % 2 ? 0.4 : -0.4 },
        moves,
      );
      if (tick % 100 === 50)
        send(
          peers[i],
          'chat:send',
          { text: `Acceptance load ${runId}-${tick}`, scope: 'room' },
          chats,
        );
    }
    tick++;
    await delay(Math.max(0, 50 - (performance.now() - t)));
  }
  await Promise.all(pending);
  const elapsed = (performance.now() - start) / 1000;
  for (let offset = 0; offset < 50; offset += 10)
    await Promise.all(
      peers.slice(offset, offset + 10).map(async (s) => {
        await ack(s, 'room:join', 'classroom');
        await ack(s, 'room:join', 'lobby');
        transitions += 2;
      }),
    );
  for (let i = 0; i < 10; i++) {
    peers[i].disconnect();
    const s = await connect(accounts[i].token);
    await ack(s, 'room:join', 'lobby');
    reconnects++;
  }
  const result = {
    origin: base,
    scope:
      'public HTTPS/WSS service, 50 independent sessions from one test host',
    durationSeconds: +elapsed.toFixed(2),
    users: 50,
    attempts,
    successfulMoves: moves.length,
    failures,
    achievedHzPerUser: +(moves.length / elapsed / 50).toFixed(2),
    moveAckMs: {
      p50: pct(moves, 0.5),
      p95: pct(moves, 0.95),
      p99: pct(moves, 0.99),
    },
    chatAckMs: { samples: chats.length, p95: pct(chats, 0.95) },
    frames,
    transitions,
    reconnects,
  };
  writeFileSync(
    'test-results/public-load.json',
    JSON.stringify(result, null, 2),
  );
  console.info(JSON.stringify(result, null, 2));
  assert.equal(failures, 0);
  assert(result.achievedHzPerUser >= 17);
  assert(result.moveAckMs.p95 < 500);
  assert(result.moveAckMs.p99 < 1500);
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const s of peers) s.disconnect();
    let remaining = 0;
    for (const a of accounts) {
      try {
        await api('/auth/account', a.token, 'DELETE', { password: a.password });
      } catch {
        remaining++;
      }
    }
    if (!remaining && accounts.length) unlinkSync(statePath);
    if (remaining) {
      console.error(
        `${remaining} test accounts need cleanup using the private local cleanup file; never commit that file.`,
      );
      process.exitCode = 1;
    }
  });
