const assert = require('node:assert/strict');
const https = require('node:https');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { io } = require('socket.io-client');
const { fixture } = require('./support/server.cjs');
let app, proxy, dir;
const sockets = [];
const origin = 'https://127.0.0.1:4303';
const request = (route, method = 'GET', body, cookie) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      origin + route,
      {
        method,
        rejectUnauthorized: false,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (b) => (text += b));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(text),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
const ack = (s, event, value) =>
  new Promise((resolve, reject) =>
    s
      .timeout(5000)
      .emit(event, value, (err, r) => (err ? reject(err) : resolve(r))),
  );
async function main() {
  app = await fixture(4302, {
    NODE_ENV: 'production',
    APP_ORIGIN: origin,
    TRUST_PROXY: '1',
  });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'respace-tls-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      path.join(dir, 'key.pem'),
      '-out',
      path.join(dir, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'pipe' },
  );
  proxy = https.createServer(
    {
      key: fs.readFileSync(path.join(dir, 'key.pem')),
      cert: fs.readFileSync(path.join(dir, 'cert.pem')),
    },
    (req, res) => {
      const upstream = http.request(
        app.base + req.url,
        {
          method: req.method,
          headers: { ...req.headers, 'x-forwarded-proto': 'https' },
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end('{}');
      });
      req.pipe(upstream);
    },
  );
  proxy.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(4302, '127.0.0.1', () => {
      upstream.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n',
      );
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
  });
  await new Promise((r) => proxy.listen(4303, '127.0.0.1', r));
  for (let i = 0; i < 2; i++) {
    const registered = await request('/auth/register', 'POST', {
      name: `TLS ${i}`,
      email: `tls-${i}@example.test`,
      password: 'tls-test-password',
    });
    assert.equal(registered.status, 201);
    const cookie = registered.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.equal(
      (await request('/auth/me', 'GET', undefined, cookie.split(';')[0]))
        .status,
      200,
    );
    const s = io(origin, {
      transports: ['websocket'],
      rejectUnauthorized: false,
      extraHeaders: { Origin: origin, Cookie: cookie.split(';')[0] },
      autoConnect: false,
    });
    sockets.push(s);
    await new Promise((resolve, reject) => {
      s.once('connect', resolve);
      s.once('connect_error', reject);
      s.connect();
    });
    assert((await ack(s, 'room:join', 'lobby')).ok);
  }
  const received = new Promise((resolve) =>
    sockets[1].once('chat:message', resolve),
  );
  assert(
    (
      await ack(sockets[0], 'chat:send', {
        text: 'WSS verified',
        scope: 'room',
      })
    ).ok,
  );
  assert.equal((await received).text, 'WSS verified');
  assert((await ack(sockets[0], 'player:move', { dx: 1, dy: 0 })).ok);
  console.info(
    'PASS: production configuration behind local TLS termination; Secure/HttpOnly/SameSite cookies; two independent authenticated WSS sessions, room join, movement and chat. This is not a public-host verification.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const s of sockets) s.disconnect();
    if (proxy) {
      proxy.closeAllConnections();
      await new Promise((r) => proxy.close(r));
    }
    if (app) await app.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });
