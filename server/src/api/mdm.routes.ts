import { Router, Request, Response } from 'express';
import { connectedDevices } from '../websocket/socket';
import { wakeDeviceById } from '../services/wol.service';
import { rebootDevice } from '../services/adb.service';

const router = Router();

// Get list of all known devices and their status
router.get('/devices', (req: Request, res: Response) => {
  const devicesList = Array.from(connectedDevices.values());
  res.json(devicesList);
});

// Send an MDM command to a specific device
router.post('/devices/:id/command', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { command, payload } = req.body;

  const io = req.app.get('io');
  if (!io) {
    return res.status(500).json({ error: 'WebSocket server not initialized' });
  }

  // Handle specific hardware/network commands
  if (command === 'screen_on') {
    await wakeDeviceById(id);
  }

  // For all other software commands (reload UI, clear cache, messages), emit via WebSocket
  io.to(`device_${id}`).emit('mdm_command', { command, payload });
  
  console.log(`[MDM] Sent command '${command}' to device ${id}`);
  res.json({ status: 'success', message: `Command ${command} dispatched to ${id}` });
});

export default router;
