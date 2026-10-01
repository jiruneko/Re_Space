const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'respace-upgrade-'));
const file = path.join(dir, 'legacy.db');
fs.writeFileSync(file, '');
const schema = path.join(dir, 'prisma');
fs.mkdirSync(schema);
fs.copyFileSync('prisma/schema.prisma', path.join(schema, 'schema.prisma'));
fs.cpSync('prisma/migrations', path.join(schema, 'migrations'), {
  recursive: true,
  filter: (source) => !source.includes('20261001000000_respace_trial'),
});
const env = { ...process.env, DATABASE_URL: `file:${file}`, ADMIN_EMAIL: '' };
const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
async function main() {
  execFileSync(
    'node',
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      path.join(schema, 'schema.prisma'),
    ],
    { env, stdio: 'pipe' },
  );
  await db.$executeRaw`INSERT INTO User (name,email,password,bio) VALUES ('Legacy User','legacy@example.test','legacy-password','Keep this biography')`;
  await db.$executeRaw`INSERT INTO Post (title,content,authorId) VALUES ('Existing post','Keep this post',1)`;
  await db.$disconnect();
  execFileSync(
    'node',
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env, stdio: 'pipe' },
  );
  const user = await db.user.findUniqueOrThrow({
    where: { email: 'legacy@example.test' },
    include: { profile: true, posts: true },
  });
  assert.equal(user.bio, 'Keep this biography');
  assert.equal(user.profile.displayName, 'Legacy User');
  assert.equal(user.posts[0].content, 'Keep this post');
  assert.equal(user.role, 'USER');
  execFileSync('node', ['scripts/hash-legacy-passwords.cjs'], {
    env,
    stdio: 'pipe',
  });
  const converted = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.match(converted.password, /^\$2/);
  execFileSync('node', ['scripts/hash-legacy-passwords.cjs'], {
    env,
    stdio: 'pipe',
  });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).password,
    converted.password,
  );
  execFileSync('node', ['scripts/seed.cjs'], { env, stdio: 'pipe' });
  await db.room.update({
    where: { id: 'lobby' },
    data: { name: 'Custom lobby', active: false, capacity: 42 },
  });
  await db.profile.update({
    where: { userId: user.id },
    data: { status: 'Keep status' },
  });
  for (let i = 0; i < 2; i++) {
    execFileSync(
      'node',
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env, stdio: 'pipe' },
    );
    execFileSync('node', ['scripts/seed.cjs'], { env, stdio: 'pipe' });
  }
  assert.equal(await db.room.count(), 4);
  assert.equal(
    (await db.room.findUnique({ where: { id: 'lobby' } })).capacity,
    42,
  );
  assert.equal(
    (await db.room.findUnique({ where: { id: 'lobby' } })).active,
    false,
  );
  assert.equal(
    (await db.profile.findUnique({ where: { userId: user.id } })).status,
    'Keep status',
  );
  assert.equal(await db.post.count(), 1);
  console.info(
    'PASS: repeated deploy migrations and production seed preserve customized rooms, profiles and posts.',
  );
  console.info(
    'PASS: latest legacy database upgrade preserves user, biography and post; creates profile; hashes plaintext password exactly once.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  });
