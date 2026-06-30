const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const r = await prisma.reservation.findFirst({
    where: { room: { roomNumber: '2003' } },
    orderBy: { createdAt: 'desc' },
    include: { room: true }
  });
  console.log(JSON.stringify(r, null, 2));
}
check().finally(() => prisma.$disconnect());
