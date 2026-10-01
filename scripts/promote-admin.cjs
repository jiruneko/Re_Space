require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email)
    throw new Error('Set ADMIN_EMAIL to an existing registered account');
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error('Register the administrator account first');
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  console.info('Administrator role updated');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
