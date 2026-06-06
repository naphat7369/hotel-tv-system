import { Router, Request, Response } from 'express';
// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

const router = Router();

// GET /api/v1/apps - List all streaming apps
router.get('/', async (req: Request, res: Response) => {
  try {
    // const apps = await prisma.streamingApp.findMany({ orderBy: { sortOrder: 'asc' } });
    res.status(200).json({ data: [] /* apps */ });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch streaming apps' });
  }
});

// POST /api/v1/apps - Create a new streaming app
router.post('/', async (req: Request, res: Response) => {
  try {
    const { hotelId, name, packageName, iconUrl } = req.body;
    // const newApp = await prisma.streamingApp.create({ data: { ... } });
    res.status(201).json({ message: 'App created successfully', data: { name, packageName } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create app' });
  }
});

export default router;
