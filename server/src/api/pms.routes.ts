import { Router, Request, Response } from 'express';
import { clearGuestApps, rebootDevice, wakeUpDevice } from '../services/adb.service';
import { connectedDevices } from '../websocket/socket';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// In-memory store (Deprecated: Use Prisma directly for status queries)
const reservationsByIp = new Map<string, any>();


router.post('/checkin', async (req: Request, res: Response) => {
  const { roomNumber, guestName, guestTag, deviceId, ip } = req.body;

  console.log(`[PMS] Check-in received for Room ${roomNumber}. Guest: ${guestName}, Tag: ${guestTag}`);

  // 1. Resolve Device ID by Room Number if not provided
  let targetDeviceId = deviceId;
  if (!targetDeviceId && roomNumber) {
    for (const [id, device] of connectedDevices.entries()) {
      if (device.roomNumber === String(roomNumber)) {
        targetDeviceId = id;
        break;
      }
    }
  }

  // 2. Find IP if not provided directly
  let targetIp = ip;
  if (!targetIp && targetDeviceId) {
    const deviceStatus = connectedDevices.get(targetDeviceId);
    if (deviceStatus && deviceStatus.ipAddress) {
      targetIp = deviceStatus.ipAddress;
    }
  }

  // Save to memory so the TV can recover its status if it wakes up later
  if (targetIp) {
    reservationsByIp.set(targetIp, {
      status: 'checked_in',
      guestName,
      guestTag,
      roomNumber,
      deviceId: targetDeviceId
    });
  } else {
    console.warn(`[PMS Warning] No IP found for check-in on room ${roomNumber}.`);
  }

  const io = req.app.get('io');
  if (io && targetDeviceId) {
    // Notify the specific device via WebSocket to update its screen
    io.to(`device_${targetDeviceId}`).emit('guest_update', {
      status: 'checked_in',
      guestName,
      guestTag, // VIP, Honeymoon, etc.
    });
    console.log(`[PMS] Sent guest_update event to device_${targetDeviceId}`);
  } else {
    console.warn(`[PMS Warning] No device found online for room ${roomNumber}. TV screen will not update immediately.`);
  }

  res.json({ status: 'success', message: 'Check-in processed successfully.' });
});

// POST /api/v1/pms/checkout
router.post('/checkout', async (req: Request, res: Response) => {
  const { roomNumber, deviceId, ip } = req.body;

  console.log(`[PMS] Check-out received for Room ${roomNumber}.`);

  // 1. Resolve Device ID by Room Number if not provided
  let targetDeviceId = deviceId;
  if (!targetDeviceId && roomNumber) {
    for (const [id, device] of connectedDevices.entries()) {
      if (device.roomNumber === String(roomNumber)) {
        targetDeviceId = id;
        break;
      }
    }
  }

  // 2. Try to find the device IP
  let targetIp = ip;
  if (!targetIp && targetDeviceId) {
    // If IP is not provided but deviceId is, lookup in our connected devices map
    const deviceStatus = connectedDevices.get(targetDeviceId);
    if (deviceStatus && deviceStatus.ipAddress) {
      targetIp = deviceStatus.ipAddress;
    }
  }

  if (!targetIp) {
    console.error(`[PMS Error] Cannot process auto-logout: No IP address available for room ${roomNumber}`);
    return res.status(400).json({ error: 'IP address is required for ADB execution' });
  }

  // 1. Send WebSocket event to clear the screen on the portal immediately
  const io = req.app.get('io');
  if (io && deviceId) {
    io.to(`device_${deviceId}`).emit('guest_update', {
      status: 'checked_out',
      guestName: null,
      guestTag: null,
    });
  }

  // 2. Perform ADB Auto-Logout and Reboot in the background (or await it)
  // The user requested to wait for clearGuestApps to finish before rebooting.
  try {
    console.log(`[PMS] Initiating ADB auto-clear for IP: ${targetIp}`);
    
    // Wait for the clearing process to completely finish
    await clearGuestApps(targetIp);
    
    console.log(`[PMS] Auto-clear finished for ${targetIp}.`);
    
    // Reboot the device (Optional: Commented out as per your request)
    // await rebootDevice(targetIp);
    
    // Clear the memory state
    reservationsByIp.delete(targetIp);

    res.json({ 
      status: 'success', 
      message: `Checkout processed. Guest apps wiped for device ${targetIp}.` 
    });

  } catch (error) {
    console.error(`[PMS Error] Checkout process failed for ${targetIp}:`, error);
    res.status(500).json({ error: 'Failed to complete checkout ADB sequence' });
  }
});

// GET /api/v1/pms/status/:ip
// Used by the portal frontend to recover its state on wake-up
router.get('/status/:ip', async (req: Request, res: Response) => {
  const { ip } = req.params;
  
  // 1. Find the room number for this IP from connected devices
  let targetRoomNumber: string | null = null;
  for (const device of connectedDevices.values()) {
    if (device.ipAddress === ip) {
      targetRoomNumber = device.roomNumber || null;
      break;
    }
  }

  if (targetRoomNumber) {
    // 2. Query Prisma for an active reservation
    const room = await prisma.room.findFirst({
      where: { roomNumber: targetRoomNumber }
    });

    if (room) {
      const activeRes = await prisma.reservation.findFirst({
        where: { roomId: room.id, status: 'In-House' }
      });

      if (activeRes) {
        return res.json({
          status: 'checked_in',
          guestName: activeRes.guestFirstName,
          guestTag: activeRes.guestLoyaltyTier
        });
      }
    } else {
      // Fallback: If room isn't in DB yet, but reservation was created loosely by webhook
      const activeRes = await prisma.reservation.findFirst({
        where: { status: 'In-House' },
        orderBy: { checkIn: 'desc' }
      });
      // This fallback isn't perfect if there are many rooms, but handles the missing Room table entry case
      if (activeRes && activeRes.roomId === null) {
        return res.json({
          status: 'checked_in',
          guestName: activeRes.guestFirstName,
          guestTag: activeRes.guestLoyaltyTier
        });
      }
    }
  }

  // Default to checked-out if no reservation found
  res.json({
    status: 'checked_out',
    guestName: null,
    guestTag: null
  });
});

export default router;
