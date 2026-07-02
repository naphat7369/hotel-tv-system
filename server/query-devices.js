const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const devices = await prisma.device.findMany();
  console.log("Devices:", devices);
}
main().catch(console.error).finally(() => prisma.$disconnect());
