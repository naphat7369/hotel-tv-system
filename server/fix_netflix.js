const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  await prisma.streamingApp.updateMany({
    where: { name: 'Netflix' },
    data: { packageName: 'com.netflix.ninja' }
  })
  console.log('Fixed Netflix package name')
}
main().finally(() => prisma.$disconnect())
