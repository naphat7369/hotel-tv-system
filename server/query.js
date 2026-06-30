const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const items = await prisma.guestMenuItem.findMany({ select: { name: true, bgImage: true } })
  console.log(items)
}
main().finally(() => prisma.$disconnect())
