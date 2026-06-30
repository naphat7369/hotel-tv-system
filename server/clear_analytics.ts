import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.usageEvent.deleteMany({}).then(() => console.log('Cleared mock analytics')).finally(() => prisma.$disconnect());
