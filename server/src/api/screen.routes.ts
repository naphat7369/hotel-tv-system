import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/v1/screens - List all screen templates
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({ data: [] });
});

// POST /api/v1/screens - Create a new screen template
router.post('/', (req: Request, res: Response) => {
  const { name, screenType, templateData, backgroundUrl } = req.body;
  res.status(201).json({ message: 'Screen template created', data: { name, screenType } });
});

// GET /api/v1/screens/:id - Get a specific screen template
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(200).json({ id, message: 'Screen template details' });
});

// PUT /api/v1/screens/:id - Update screen template
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(200).json({ message: 'Screen template updated' });
});

export default router;
