require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const db = new PrismaClient();
async function main() {
  let count = 0;
  for (const user of await db.user.findMany()) {
    if (/^\$2[aby]\$/.test(user.password)) continue;
    await db.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(user.password, 12) },
    });
    count++;
  }
  console.info(
    `Converted ${count} legacy password records. Existing sessions should be renewed.`,
  );
}
main()
  .catch(() => {
    console.error('Migration failed; inspect database connectivity');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
