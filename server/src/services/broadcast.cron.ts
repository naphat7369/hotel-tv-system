import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';

// Keep track of what is currently shown to avoid spamming the TVs
// Map of broadcastId -> isCurrentlyShown
const shownBroadcasts = new Map<string, boolean>();

export const initBroadcastCron = (io: any) => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      
      const activeBroadcasts = await prisma.activeBroadcast.findMany({
        where: {
          hotelId: MOCK_HOTEL_ID,
          isActive: true
        }
      });

      for (const broadcast of activeBroadcasts) {
        const start = broadcast.startTime ? new Date(broadcast.startTime) : null;
        const end = broadcast.endTime ? new Date(broadcast.endTime) : null;
        
        const shouldStartNow = !start || start <= now;
        const isEnded = end && end <= now;

        if (isEnded) {
          // It's time to stop this broadcast
          await prisma.activeBroadcast.update({
            where: { id: broadcast.id },
            data: { isActive: false }
          });
          
          if (broadcast.type === 'alert') {
            io.emit('hide_modal', { id: broadcast.id });
          }
          
          // Check if there are any other active broadcasts
          const nextActive = await prisma.activeBroadcast.findFirst({
            where: {
              hotelId: MOCK_HOTEL_ID,
              isActive: true,
              OR: [
                { startTime: null },
                { startTime: { lte: now } }
              ],
              AND: [
                { OR: [{ endTime: null }, { endTime: { gt: now } }] }
              ]
            },
            orderBy: { createdAt: 'desc' }
          });

          if (nextActive) {
            const eventName = nextActive.type === 'alert' ? 'show_modal' : 'show_marquee';
            io.emit(eventName, {
              id: nextActive.id,
              message: nextActive.message,
              type: nextActive.type,
              targetDeviceIds: null
            });
          } else {
            io.emit('hide_broadcast', { id: broadcast.id });
          }
          
          shownBroadcasts.delete(broadcast.id);
          console.log(`[Broadcast Cron] Stopped broadcast ${broadcast.id}`);
        } else if (shouldStartNow) {
          // If we haven't shown it yet, or the server restarted and we lost state
          if (!shownBroadcasts.get(broadcast.id)) {
            // Find target devices
            let targetCriteria: any = {};
            if (broadcast.target === 'room' && broadcast.targetRoom) {
              targetCriteria = { roomNumber: broadcast.targetRoom };
            } else if (broadcast.target === 'floor' && broadcast.targetFloor) {
              targetCriteria = { floor: broadcast.targetFloor };
            }

            const devices = await prisma.device.findMany({
              where: {
                hotelId: MOCK_HOTEL_ID,
                ...(broadcast.target !== 'all' ? {
                  room: {
                    ...targetCriteria
                  }
                } : {})
              }
            });

            const deviceIds = devices.map(d => d.id);
            const eventName = broadcast.type === 'alert' ? 'show_modal' : 'show_marquee';
            
            io.emit(eventName, {
              id: broadcast.id,
              message: broadcast.message,
              type: broadcast.type,
              targetDeviceIds: broadcast.target === 'all' ? null : deviceIds
            });
            
            shownBroadcasts.set(broadcast.id, true);
            console.log(`[Broadcast Cron] Triggered broadcast ${broadcast.id}`);
          }
        }
      }
    } catch (error) {
      console.error('[Broadcast Cron] Error processing schedules:', error);
    }
  });
};
