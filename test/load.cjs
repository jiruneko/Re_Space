const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { JwtService } = require('@nestjs/jwt');
const { io } = require('socket.io-client');
const { fixture, delay } = require('./support/server.cjs');
const count = 50,
  duration = Number(process.env.LOAD_SECONDS || 15),
  peers = [],
  latency = [],
  chatLatency = [];
let app,
  attempts = 0,
  failures = 0,
  received = 0,
  rosterBytes = 0,
  frameBytes = 0,
  frames = 0,
  peakRss = 0,
  sample;
const ack = (socket, event, value) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(4000)
      .emit(event, value, (e, r) => (e ? reject(e) : resolve(r))),
  );
const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(app.base, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
function percentile(a, p) {
  return Math.round(
    [...a].sort((a, b) => a - b)[
      Math.min(a.length - 1, Math.floor(a.length * p))
    ] || 0,
  );
}
async function main() {
  app = await fixture(4300);
  await app.db.room.update({
    where: { id: 'lobby' },
    data: { capacity: count },
  });
  const jwt = new JwtService({ secret: app.env.JWT_SECRET });
  const tokens = [];
  // Fixture setup intentionally bypasses public signup rate limits; all sockets still authenticate normally.
  for (let i = 0; i < count; i++) {
    const user = await app.db.user.create({
      data: {
        name: `Load ${i}`,
        email: `load-${i}@example.test`,
        password: 'not-a-login-password',
        profile: { create: { displayName: `Load ${i}` } },
      },
    });
    const session = await app.db.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 600000) },
    });
    tokens.push(
      jwt.sign({ sub: user.id, sid: session.id }, { expiresIn: '10m' }),
    );
  }
  for (const token of tokens) {
    const socket = await connect(token);
    peers.push(socket);
    socket.on('players', (players) => {
      received++;
      if (!rosterBytes && players.length === count)
        rosterBytes = Buffer.byteLength(JSON.stringify(players));
    });
    socket.on('world:frame', (frame) => {
      frames++;
      frameBytes += Buffer.byteLength(JSON.stringify(frame));
    });
    const result = await ack(socket, 'room:join', 'lobby');
    assert(result.ok);
  }
  assert.equal(
    (await ack(peers[0], 'room:join', 'lobby')).data.players.length,
    count,
  );
  sample = setInterval(() => {
    try {
      const m = /VmRSS:\s+(\d+)/.exec(
        readFileSync(`/proc/${app.pid()}/status`, 'utf8'),
      );
      peakRss = Math.max(peakRss, Number(m?.[1] || 0) / 1024);
    } catch {}
  }, 500);
  const start = performance.now(),
    deadline = start + duration * 1000;
  received = 0;
  frames = 0;
  frameBytes = 0;
  await Promise.all(
    peers.map(async (socket, index) => {
      let n = 0;
      while (performance.now() < deadline) {
        const t = performance.now();
        attempts++;
        try {
          const response = await ack(socket, 'player:move', {
            dx: Math.floor(n / 30) % 2 ? -1 : 1,
            dy: index % 2 ? 0.4 : -0.4,
          });
          if (!response.ok) failures++;
          else latency.push(performance.now() - t);
          if (n % 100 === 50) {
            const ct = performance.now();
            const chat = await ack(socket, 'chat:send', {
              text: `load-${index}-${n}`,
              scope: 'room',
            });
            if (!chat.ok) failures++;
            else chatLatency.push(performance.now() - ct);
          }
        } catch {
          failures++;
        }
        n++;
        await delay(Math.max(0, 50 - (performance.now() - t)));
      }
    }),
  );
  const elapsed = (performance.now() - start) / 1000;
  const measured = { received, frames, frameBytes };
  let transitions = 0,
    reconnections = 0;
  for (let offset = 0; offset < 50; offset += 10) {
    await Promise.all(
      peers.slice(offset, offset + 10).map(async (socket) => {
        assert((await ack(socket, 'room:join', 'classroom')).ok);
        assert((await ack(socket, 'room:join', 'lobby')).ok);
        transitions += 2;
      }),
    );
  }
  for (let i = 0; i < 10; i++) {
    peers[i].disconnect();
    const socket = await connect(tokens[i]);
    peers[i] = socket;
    assert((await ack(socket, 'room:join', 'lobby')).ok);
    reconnections++;
  }
  const result = {
    scope: 'local isolated server; not an internet/host capacity guarantee',
    users: count,
    requestedMoveHzPerUser: 20,
    durationSeconds: Number(elapsed.toFixed(2)),
    moveAttempts: attempts,
    successfulMoves: latency.length,
    achievedMoveHzPerUser: Number(
      (latency.length / elapsed / count).toFixed(2),
    ),
    failures,
    moveAckMs: {
      p50: percentile(latency, 0.5),
      p95: percentile(latency, 0.95),
      p99: percentile(latency, 0.99),
    },
    chatAckMs: {
      samples: chatLatency.length,
      p95: percentile(chatLatency, 0.95),
    },
    rosterEventsReceived: measured.received,
    movementFramesReceived: measured.frames,
    estimatedMovementMB: Number((measured.frameBytes / 1024 / 1024).toFixed(2)),
    estimatedRosterMB: Number(
      ((measured.received * rosterBytes) / 1024 / 1024).toFixed(2),
    ),
    serverPeakRssMB: peakRss ? Number(peakRss.toFixed(1)) : null,
    roomTransitions: transitions,
    reconnections,
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    process.env.LOAD_REPORT || 'test-results/load.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  if (process.env.LOAD_BASELINE !== '1') {
    assert.equal(failures, 0);
    assert(result.achievedMoveHzPerUser >= 17);
    assert(result.moveAckMs.p95 < 250);
    assert(result.moveAckMs.p99 < 1000);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearInterval(sample);
    for (const socket of peers) socket.disconnect();
    if (app) await app.close();
  });
