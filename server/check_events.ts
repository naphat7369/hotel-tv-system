import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.usageEvent.findMany().then(events => console.log(JSON.stringify(events, null, 2))).finally(() => prisma.$disconnect());
