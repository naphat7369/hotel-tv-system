const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const r = await prisma.reservation.findFirst({
    where: { guestFirstName: 'Tiwaporn CORBET' },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(r, null, 2));
}
check().finally(() => prisma.$disconnect());
