import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function fix() {
   const room = await prisma.room.findFirst({where: { roomNumber: '1109' }});
   if(!room) return console.log("Room 1109 not found");
   await prisma.reservation.updateMany({
       where: { roomId: room.id, status: 'In-House' },
       data: { status: 'Checked-Out', checkOut: new Date() }
   });
   console.log("Forced check-out for 1109");
}
fix().then(()=>process.exit(0));
