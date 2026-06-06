import { Router, Request, Response } from 'express';
// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

const router = Router();

// GET /api/v1/channels - List all channels
router.get('/', async (req: Request, res: Response) => {
  try {
    // const channels = await prisma.channel.findMany({ orderBy: { sortOrder: 'asc' } });
    res.status(200).json({ data: [] /* channels */ });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// POST /api/v1/channels - Create a new channel
router.post('/', async (req: Request, res: Response) => {
  try {
    const { hotelId, name, channelNumber, category, streamUrl } = req.body;
    // const newChannel = await prisma.channel.create({ data: { ... } });
    res.status(201).json({ message: 'Channel created successfully', data: { name, channelNumber } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// PUT /api/v1/channels/:id - Update a channel
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // const updated = await prisma.channel.update({ where: { id }, data: req.body });
    res.status(200).json({ message: 'Channel updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// DELETE /api/v1/channels/:id - Delete a channel
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // await prisma.channel.delete({ where: { id } });
    res.status(200).json({ message: 'Channel deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

export default router;
