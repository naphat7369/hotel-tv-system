import { Router, Request, Response } from 'express';
import { connectedDevices } from '../websocket/socket';
import * as wol from 'wake_on_lan';

const router = Router();

// Get list of all known devices and their status
router.get('/devices', (req: Request, res: Response) => {
  const devicesList = Array.from(connectedDevices.values());
  res.json(devicesList);
});

// Send an MDM command to a specific device
router.post('/devices/:id/command', (req: Request, res: Response) => {
  const { id } = req.params;
  const { command, payload } = req.body;

  const io = req.app.get('io');
  if (!io) {
    return res.status(500).json({ error: 'WebSocket server not initialized' });
  }

  // Handle Wake-on-LAN specially because the device might be offline
  if (command === 'screen_on') {
    const device = connectedDevices.get(id);
    if (device && device.macAddress) {
      wol.wake(device.macAddress, (error: any) => {
        if (error) {
          console.error(`WoL Error for ${id}:`, error);
        } else {
          console.log(`Sent Wake-on-LAN magic packet to ${id} (${device.macAddress})`);
        }
      });
    } else {
      console.warn(`Attempted screen_on (WoL) for ${id} but MAC address is unknown.`);
    }
  }

  // For all commands, emit the event via WebSocket to the targeted device room
  io.to(`device_${id}`).emit('mdm_command', { command, payload });
  
  console.log(`[MDM] Sent command '${command}' to device ${id}`);
  res.json({ status: 'success', message: `Command ${command} dispatched to ${id}` });
});

export default router;
