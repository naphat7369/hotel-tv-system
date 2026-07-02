const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const rooms = await prisma.room.findMany();
  console.log("Rooms:", rooms);
}
main().catch(console.error).finally(() => prisma.$disconnect());
