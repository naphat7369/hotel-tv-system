import { Router, Request, Response } from 'express';
import os from 'os';
import { connectedDevices } from '../websocket/socket';
import { wakeDeviceById } from '../services/wol.service';
import { rebootDevice } from '../services/adb.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Helper to get the actual LAN IP of the Node.js server
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    if (iface) {
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          return alias.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

// Get list of all known devices and their status
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const dbDevices = await prisma.device.findMany({
      include: { room: true },
      orderBy: { registeredAt: 'desc' }
    });

    const devicesList = dbDevices.map(dbDevice => {
      // Find in-memory device to get transient properties like socketId, wifiSignal, deviceName if needed
      // But we mostly rely on DB now
      const inMemory = connectedDevices.get(dbDevice.boxSerial);

      return {
        deviceId: dbDevice.boxSerial,
        isOnline: dbDevice.isOnline,
        lastSeen: dbDevice.lastSeen ? dbDevice.lastSeen.toISOString() : null,
        ipAddress: dbDevice.ipAddress || undefined,
        macAddress: dbDevice.macAddress || undefined,
        wifiSignal: inMemory?.wifiSignal,
        socketId: inMemory?.socketId,
        roomNumber: dbDevice.room?.roomNumber || undefined,
        deviceName: inMemory?.deviceName
      };
    });

    res.json(devicesList);
  } catch (error) {
    console.error('[MDM] Error fetching devices from DB:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Send an MDM command to a specific device
router.post('/devices/:id/command', async (req: Request, res: Response) => {
  const { id } = req.params;
  let { command, payload } = req.body;

  const io = req.app.get('io');
  if (!io) {
    return res.status(500).json({ error: 'WebSocket server not initialized' });
  }

  // Intercept install_apk to prepend the exact LAN IP so the TV Box can reach the server
  if (command === 'install_apk' && payload && payload.url) {
    if (payload.url.startsWith('/')) {
      const ip = getLocalIpAddress();
      const port = process.env.PORT || 3000;
      payload.url = `http://${ip}:${port}${payload.url}`;
    }
  }

  // Handle specific hardware/network commands
  if (command === 'screen_on') {
    await wakeDeviceById(id);
  } else if (command === 'set_device_name') {
    const device = connectedDevices.get(id);
    if (device && device.ipAddress) {
      const { setDeviceName } = require('../services/adb.service');
      await setDeviceName(device.ipAddress, payload.name);
      // Save in memory
      device.deviceName = payload.name;
      connectedDevices.set(id, device);
      // Broadcast updated list to CMS
      const devicesList = Array.from(connectedDevices.values());
      io.emit('device_status_update', devicesList);
    }
  } else if (command === 'set_room_number') {
    const targetRoomNumber = String(payload?.roomNumber || '').trim();

    if (targetRoomNumber && targetRoomNumber !== 'Unassigned') {
      // 1. Check connected devices in memory
      for (const [existingDeviceId, existingDevice] of connectedDevices.entries()) {
        if (existingDeviceId !== id && existingDevice.roomNumber === targetRoomNumber) {
          console.warn(`[MDM Warning] Cannot set room ${targetRoomNumber} for ${id}: Already assigned to ${existingDeviceId}`);
          return res.status(400).json({
            error: `Cannot assign: Room ${targetRoomNumber} is already assigned to device ${existingDeviceId}`
          });
        }
      }

      // 2. Check Database records (to cover offline devices as well)
      try {
        const dbConflict = await prisma.device.findFirst({
          where: {
            boxSerial: { not: id },
            room: { roomNumber: targetRoomNumber }
          }
        });

        if (dbConflict) {
          console.warn(`[MDM Warning] Cannot set room ${targetRoomNumber} for ${id}: Already assigned in DB to ${dbConflict.boxSerial}`);
          return res.status(400).json({
            error: `Cannot assign: Room ${targetRoomNumber} is already assigned to device ${dbConflict.boxSerial}`
          });
        }
      } catch (err) {
        console.error('[MDM Error] Error checking room conflict in DB:', err);
      }
    }

    const device = connectedDevices.get(id);
    if (device) {
      device.roomNumber = payload.roomNumber;
      connectedDevices.set(id, device);
      // Broadcast update immediately to CMS
      const devicesList = Array.from(connectedDevices.values());
      io.emit('device_status_update', devicesList);
    }
  } else if (command === 'reboot') {
    const device = connectedDevices.get(id);
    if (device && device.ipAddress) {
      const { rebootDevice } = require('../services/adb.service');
      await rebootDevice(device.ipAddress);
      return res.json({ status: 'success', message: `Reboot command sent to ${id} via ADB` });
    } else {
      return res.status(400).json({ error: `Cannot reboot: IP address for device ${id} is missing` });
    }
  }

  // For all other software commands (reload UI, clear cache, messages), emit via WebSocket
  io.to(`device_${id}`).emit('mdm_command', { command, payload });
  
  console.log(`[MDM] Sent command '${command}' to device ${id}`);
  res.json({ status: 'success', message: `Command ${command} dispatched to ${id}` });
});

// Delete a device record from the database
router.delete('/devices/:serial', async (req: Request, res: Response) => {
  const { serial } = req.params;
  try {
    await prisma.device.delete({ where: { boxSerial: serial } });
    // Also remove from in-memory map
    connectedDevices.delete(serial);
    console.log(`[MDM] Deleted device ${serial} from DB`);
    res.json({ status: 'success', message: `Device ${serial} deleted` });
  } catch (error) {
    console.error('[MDM] Error deleting device:', error);
    res.status(404).json({ error: `Device ${serial} not found` });
  }
});

export default router;
