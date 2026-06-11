import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// Middleware to mock hotelId for now since there's no auth
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';

// GET /api/v1/broadcast/messages
// Get all saved custom messages
router.get('/messages', async (req: Request, res: Response) => {
  try {
    const messages = await (prisma as any).savedMessage.findMany({
      where: { hotelId: MOCK_HOTEL_ID },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching saved messages:', error);
    res.status(500).json({ error: 'Failed to fetch saved messages' });
  }
});

// POST /api/v1/broadcast/messages
// Save a custom message for future use
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const { message, type } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const newMessage = await (prisma as any).savedMessage.create({
      data: {
        hotelId: MOCK_HOTEL_ID,
        message,
        type: type || 'custom'
      }
    });
    
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// DELETE /api/v1/broadcast/messages/:id
// Delete a saved message
router.delete('/messages/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).savedMessage.delete({ where: { id } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// GET /api/v1/broadcast/active
// Get all active and scheduled broadcasts
router.get('/active', async (req: Request, res: Response) => {
  try {
    const broadcasts = await (prisma as any).activeBroadcast.findMany({
      where: { hotelId: MOCK_HOTEL_ID },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(broadcasts);
  } catch (error) {
    console.error('Error fetching active broadcasts:', error);
    res.status(500).json({ error: 'Failed to fetch active broadcasts' });
  }
});

// DELETE /api/v1/broadcast/active/:id
// Stop/Delete an active or scheduled broadcast
router.delete('/active/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get the broadcast before deleting
    const broadcast = await (prisma as any).activeBroadcast.findUnique({ where: { id } });
    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    // Delete it
    await (prisma as any).activeBroadcast.delete({ where: { id } });
    
    // Tell TVs to hide this broadcast or show another active one
    const io = req.app.get('io');
    if (io) {
      if (broadcast.type === 'alert') {
        io.emit('hide_modal', { id });
      }
      
      const now = new Date();
      // Check if there are any other active broadcasts
      const nextActive = await (prisma as any).activeBroadcast.findFirst({
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
        // If another broadcast is active, show it
        const eventName = nextActive.type === 'alert' ? 'show_modal' : 'show_marquee';
        io.emit(eventName, {
          id: nextActive.id,
          message: nextActive.message,
          type: nextActive.type,
          targetDeviceIds: null // assuming global for fallback simplicity
        });
      } else {
        // Hide all (will restore default on client)
        io.emit('hide_broadcast', { id });
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting active broadcast:', error);
    res.status(500).json({ error: 'Failed to delete active broadcast' });
  }
});

// POST /api/v1/broadcast/send
// Send or Schedule a broadcast message
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { type, message, target, targetRoom, targetFloor, startTime, endTime } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Save to ActiveBroadcast
    const activeBroadcast = await (prisma as any).activeBroadcast.create({
      data: {
        hotelId: MOCK_HOTEL_ID,
        message,
        type: type || 'default',
        target: target || 'all',
        targetRoom: target === 'room' ? targetRoom : null,
        targetFloor: target === 'floor' ? parseInt(targetFloor) : null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        isActive: true
      }
    });

    // Determine target filter
    let targetCriteria: any = {};
    if (target === 'room' && targetRoom) {
      targetCriteria = { roomNumber: targetRoom };
    } else if (target === 'floor' && targetFloor) {
      targetCriteria = { floor: parseInt(targetFloor) };
    }

    // Find the relevant devices
    const devices = await prisma.device.findMany({
      where: {
        hotelId: MOCK_HOTEL_ID,
        ...(target !== 'all' ? {
          room: {
            ...targetCriteria
          }
        } : {})
      },
      include: {
        room: true
      }
    });

    const deviceIds = devices.map(d => d.id);
    
    // Check if it should be broadcasted immediately
    const now = new Date();
    const start = activeBroadcast.startTime ? new Date(activeBroadcast.startTime) : null;
    const end = activeBroadcast.endTime ? new Date(activeBroadcast.endTime) : null;
    
    const shouldStartNow = !start || start <= now;
    const isNotEnded = !end || end > now;

    if (shouldStartNow && isNotEnded) {
      // Broadcast using Socket.IO
      const io = req.app.get('io');
      if (io) {
        const eventName = type === 'alert' ? 'show_modal' : 'show_marquee';
        io.emit(eventName, {
          id: activeBroadcast.id,
          message,
          type,
          targetDeviceIds: target === 'all' ? null : deviceIds
        });
      }
    }
    
    res.status(200).json({ 
      success: true, 
      message: shouldStartNow && isNotEnded ? 'Broadcast sent' : 'Broadcast scheduled', 
      broadcast: activeBroadcast
    });

  } catch (error) {
    console.error('Error sending broadcast:', error);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

export default router;
