const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.channel.updateMany({
    data: {
      bgImage: '/uploads/backgrounds/bg_luxury_gold_navy_1786349674474.png'
    }
  });
  console.log(`Updated ${result.count} channels.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
