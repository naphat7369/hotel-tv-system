const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
  const reservations = await prisma.reservation.findMany({
    where: { room: { roomNumber: '1810' } },
    include: { room: true }
  });
  console.log(JSON.stringify(reservations, null, 2));
}

checkDb().finally(() => prisma.$disconnect());
