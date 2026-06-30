const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  const result = await prisma.reservation.updateMany({
    where: { roomId: null, status: 'In-House' },
    data: { status: 'Checked-Out' }
  });
  console.log(result);
}

clean().finally(() => prisma.$disconnect());
