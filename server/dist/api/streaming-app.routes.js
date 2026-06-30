"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const router = (0, express_1.Router)();
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';
// GET /api/v1/streaming-apps
router.get('/', async (req, res) => {
    try {
        const apps = await prisma.streamingApp.findMany({
            where: { hotelId: MOCK_HOTEL_ID },
            orderBy: { sortOrder: 'asc' }
        });
        res.json(apps);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch streaming apps' });
    }
});
// POST /api/v1/streaming-apps
router.post('/', async (req, res) => {
    try {
        const { name, packageName, iconUrl, deepLink, isActive, sortOrder } = req.body;
        // Auto-increment sortOrder if not provided
        let finalSortOrder = sortOrder;
        if (finalSortOrder === undefined || finalSortOrder === null) {
            const count = await prisma.streamingApp.count({ where: { hotelId: MOCK_HOTEL_ID } });
            finalSortOrder = count + 1;
        }
        const app = await prisma.streamingApp.create({
            data: {
                hotelId: MOCK_HOTEL_ID,
                name,
                packageName,
                iconUrl,
                deepLink,
                isActive: isActive !== undefined ? isActive : true,
                sortOrder: finalSortOrder
            }
        });
        res.status(201).json(app);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create streaming app' });
    }
});
// PUT /api/v1/streaming-apps/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        const app = await prisma.streamingApp.update({
            where: { id },
            data
        });
        res.json(app);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update streaming app' });
    }
});
// DELETE /api/v1/streaming-apps/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.streamingApp.delete({ where: { id } });
        res.json({ message: 'Deleted successfully' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete streaming app' });
    }
});
exports.default = router;
