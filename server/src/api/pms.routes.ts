import { Router, Request, Response } from 'express';
import { clearGuestApps, rebootDevice, wakeUpDevice } from '../services/adb.service';
import { connectedDevices } from '../websocket/socket';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// In-memory store (Deprecated: Use Prisma directly for status queries)
const reservationsByIp = new Map<string, any>();

type Target = { deviceId: string | null; ip: string | null };

/**
 * Resolve which TV box(es) a PMS request targets.
 * - If deviceId or ip is given explicitly, target only that device.
 * - Otherwise, target ALL connected devices assigned to the room number
 *   (a room may have more than one TV box).
 */
function resolveTargets(deviceId?: string, ip?: string, roomNumber?: string | number): Target[] {
  if (deviceId || ip) {
    const resolvedIp = ip || (deviceId ? connectedDevices.get(deviceId)?.ipAddress : null) || null;
    return [{ deviceId: deviceId || null, ip: resolvedIp }];
  }
  const targets: Target[] = [];
  if (roomNumber !== undefined && roomNumber !== null && roomNumber !== '') {
    for (const [id, device] of connectedDevices.entries()) {
      if (device.roomNumber === String(roomNumber)) {
        targets.push({ deviceId: id, ip: device.ipAddress || null });
      }
    }
  }
  return targets;
}


router.post('/checkin', async (req: Request, res: Response) => {
  const { roomNumber, guestTag, deviceId, ip, gender, title } = req.body;
  let { guestName } = req.body;

  if (guestName && typeof guestName === 'string') {
    guestName = guestName.trim();
    let prefix = '';
    if (title) {
      prefix = String(title).trim();
    } else if (gender) {
      const g = String(gender).toLowerCase();
      if (g === 'm' || g === 'male') prefix = 'Mr.';
      else if (g === 'f' || g === 'female') prefix = 'Ms.';
    }
    if (prefix && !guestName.toLowerCase().startsWith(prefix.toLowerCase().replace('.', ''))) {
      if ((prefix === 'Mr' || prefix === 'Ms') && !prefix.endsWith('.')) prefix += '.';
      guestName = `${prefix} ${guestName}`;
    }
  }

  console.log(`[PMS] Check-in received for Room ${roomNumber}. Guest: ${guestName}, Tag: ${guestTag}`);

  // 1. Resolve target devices: explicit deviceId/ip, or ALL devices in the room (a room may have multiple TV boxes)
  const targets = resolveTargets(deviceId, ip, roomNumber);

  if (targets.length === 0) {
    console.warn(`[PMS Warning] No IP found for check-in on room ${roomNumber}.`);
  }

  const io = req.app.get('io');
  for (const t of targets) {
    // Save to memory so the TV can recover its status if it wakes up later
    if (t.ip) {
      reservationsByIp.set(t.ip, {
        status: 'checked_in',
        guestName,
        guestTag,
        roomNumber,
        deviceId: t.deviceId
      });
    }

    if (io && t.deviceId) {
      // Notify the specific device via WebSocket to update its screen
      io.to(`device_${t.deviceId}`).emit('guest_update', {
        status: 'checked_in',
        guestName,
        guestTag, // VIP, Honeymoon, etc.
      });
      console.log(`[PMS] Sent guest_update event to device_${t.deviceId}`);
    }
  }

  if (!targets.some(t => t.deviceId)) {
    console.warn(`[PMS Warning] No device found online for room ${roomNumber}. TV screen will not update immediately.`);
  }

  res.json({ status: 'success', message: 'Check-in processed successfully.' });
});

// POST /api/v1/pms/checkout
router.post('/checkout', async (req: Request, res: Response) => {
  const { roomNumber, deviceId, ip } = req.body;

  console.log(`[PMS] Check-out received for Room ${roomNumber}.`);

  // 1. Resolve target devices: explicit deviceId/ip, or ALL devices in the room (a room may have multiple TV boxes)
  const targets = resolveTargets(deviceId, ip, roomNumber).filter(t => t.ip);

  if (targets.length === 0) {
    console.error(`[PMS Error] Cannot process auto-logout: No IP address available for room ${roomNumber}`);
    return res.status(400).json({ error: 'IP address is required for ADB execution' });
  }

  // 1. Send WebSocket event to clear the screen on the portal immediately
  const io = req.app.get('io');
  if (io) {
    for (const t of targets) {
      if (!t.deviceId) continue;
      io.to(`device_${t.deviceId}`).emit('guest_update', {
        status: 'checked_out',
        guestName: null,
        guestTag: null,
      });
    }
  }

  // 2. Perform ADB Auto-Logout and Reboot in the background (or await it)
  // The user requested to wait for clearGuestApps to finish before rebooting.
  const ips = targets.map(t => t.ip as string);
  try {
    console.log(`[PMS] Initiating ADB auto-clear for IP(s): ${ips.join(', ')}`);
    
    // Wait for the clearing process to completely finish on every device in the room
    await Promise.all(ips.map(targetIp => clearGuestApps(targetIp)));
    
    console.log(`[PMS] Auto-clear finished for ${ips.join(', ')}.`);
    
    // Reboot the device (Optional: Commented out as per your request)
    // await rebootDevice(targetIp);
    
    // Clear the memory state
    ips.forEach(targetIp => reservationsByIp.delete(targetIp));

    res.json({ 
      status: 'success', 
      message: `Checkout processed. Guest apps wiped for device(s) ${ips.join(', ')}.` 
    });

  } catch (error) {
    console.error(`[PMS Error] Checkout process failed for ${ips.join(', ')}:`, error);
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
        where: { roomId: room.id, status: 'In-House' },
        orderBy: { createdAt: 'desc' }
      });

      if (activeRes && (!activeRes.checkOut || new Date() < activeRes.checkOut)) {
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
        orderBy: { createdAt: 'desc' }
      });
      if (activeRes && activeRes.roomId === null && (!activeRes.checkOut || new Date() < activeRes.checkOut)) {
        return res.json({
          status: 'checked_in',
          guestName: activeRes.guestFirstName,
          guestTag: activeRes.guestLoyaltyTier
        });
      }
    }
  }

  // Default to checked-out if no reservation found or reservation expired
  res.json({
    status: 'checked_out',
    guestName: null,
    guestTag: null
  });
});

// GET /api/v1/pms/room/:roomNumber
// Fetch current payload/guest status directly by room number (No IP required)
router.get('/room/:roomNumber', async (req: Request, res: Response) => {
  const { roomNumber } = req.params;

  try {
    const room = await prisma.room.findFirst({
      where: { roomNumber: String(roomNumber) }
    });

    if (room) {
      const activeRes = await prisma.reservation.findFirst({
        where: { roomId: room.id, status: 'In-House' },
        orderBy: { createdAt: 'desc' }
      });

      if (activeRes && (!activeRes.checkOut || new Date() < activeRes.checkOut)) {
        return res.json({
          roomNumber,
          status: 'checked_in',
          guestName: activeRes.guestFirstName,
          guestTag: activeRes.guestLoyaltyTier,
          checkIn: activeRes.checkIn,
          checkOut: activeRes.checkOut,
          updatedAt: activeRes.updatedAt
        });
      }
    }

    res.json({
      roomNumber,
      status: 'checked_out',
      guestName: null,
      guestTag: null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch room status' });
  }
});

export default router;
