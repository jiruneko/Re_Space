require('dotenv/config');
const { existsSync, mkdirSync, closeSync, openSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:'))
  throw new Error(
    'This deployment uses SQLite: DATABASE_URL must start with file:',
  );
const name = url.slice(5),
  file = isAbsolute(name) ? name : resolve('prisma', name);
mkdirSync(dirname(file), { recursive: true });
if (!existsSync(file)) closeSync(openSync(file, 'wx', 0o600));
