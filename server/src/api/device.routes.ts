import { Router, Request, Response } from 'express';
import { getRecentDeviceLogs } from '../services/device-log.service';

const router = Router();

// GET /api/v1/devices/logs - Query recent device logs
router.get('/logs', (req: Request, res: Response) => {
  const { boxSerial, roomNumber, level, tag, limit } = req.query;
  const logs = getRecentDeviceLogs({
    boxSerial: boxSerial ? String(boxSerial) : undefined,
    roomNumber: roomNumber ? String(roomNumber) : undefined,
    level: level ? String(level) : undefined,
    tag: tag ? String(tag) : undefined,
    limit: limit ? parseInt(String(limit), 10) : 100
  });
  res.status(200).json({ logs });
});

// GET /api/v1/devices - List all devices
router.get('/', (req: Request, res: Response) => {
  // TODO: Fetch from database
  res.status(200).json({ devices: [] });
});

// POST /api/v1/devices/register - Register new box
router.post('/register', (req: Request, res: Response) => {
  const { box_serial, mac_address, room_id } = req.body;
  
  if (!box_serial || !mac_address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // TODO: Save to database
  res.status(201).json({ 
    message: 'Device registered successfully',
    device: { box_serial, mac_address, status: 'registered' }
  });
});

// GET /api/v1/devices/:id - Get device details
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  // TODO: Fetch from database
  res.status(200).json({ id, message: 'Device details' });
});

export default router;
