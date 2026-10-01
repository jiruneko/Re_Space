require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const rooms = [
    {
      id: 'lobby',
      name: 'はじまりのロビー',
      description: 'まずはここから。挨拶だけでも、眺めるだけでも。',
      theme: 'lobby',
      capacity: 50,
    },
    {
      id: 'classroom',
      name: 'まなびの教室',
      description: '一緒に学ぶ、考える。小さな発見を持ち寄ろう。',
      theme: 'classroom',
      capacity: 30,
    },
    {
      id: 'consultation',
      name: 'おはなし相談室',
      description:
        'チャット履歴は保存しません。公開ルームのため個人情報は書かないでください。',
      theme: 'consultation',
      capacity: 6,
    },
    {
      id: 'break',
      name: 'ひとやすみラウンジ',
      description: '少し肩の力を抜いて、自由に過ごせる場所。',
      theme: 'break',
      capacity: 30,
    },
  ];
  for (const room of rooms)
    await db.room.upsert({ where: { id: room.id }, create: room, update: {} });
  for (const user of await db.user.findMany({
    where: { profile: null },
    select: { id: true, name: true },
  }))
    await db.profile.create({
      data: { userId: user.id, displayName: user.name },
    });
  console.info('Rooms and profiles ready');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
