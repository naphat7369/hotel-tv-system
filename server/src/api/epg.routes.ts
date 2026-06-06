import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/v1/epg - Get EPG data
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({ data: [] });
});

// POST /api/v1/epg/sync - Sync EPG data from source
router.post('/sync', (req: Request, res: Response) => {
  res.status(200).json({ message: 'EPG Sync initiated' });
});

export default router;
