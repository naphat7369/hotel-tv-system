const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
  const reservations = await prisma.reservation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2,
    include: { room: true }
  });
  console.log(JSON.stringify(reservations, null, 2));
}

checkDb().finally(() => prisma.$disconnect());
