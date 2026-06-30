"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma = new client_1.PrismaClient();
const router = (0, express_1.Router)();
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';
// ── Ensure hotel record exists ──────────────────────────────────────────────
const ensureHotel = async () => {
    const hotel = await prisma.hotel.findUnique({ where: { id: MOCK_HOTEL_ID } });
    if (!hotel) {
        await prisma.hotel.create({
            data: { id: MOCK_HOTEL_ID, name: 'Grand Horizon Hotel', code: 'GH001' }
        });
    }
};
// ── Image Upload (Multer) ───────────────────────────────────────────────────
const uploadDir = path_1.default.join(__dirname, '../../../uploads/menu-images');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `menu-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/'))
            cb(null, true);
        else
            cb(new Error('Only image files are allowed'));
    },
});
// ── WebSocket helper ────────────────────────────────────────────────────────
const emitMenuRefresh = (req, action, item) => {
    req.app.get('io')?.emit('refresh_guest_menu', { action, item });
};
// ── Scheduling helper ───────────────────────────────────────────────────────
// Used by GET endpoint to filter items whose schedule window is active
const isScheduleActive = (item) => {
    const now = new Date();
    if (item.activeFrom && now < item.activeFrom)
        return false;
    if (item.activeUntil && now > item.activeUntil)
        return false;
    return true;
};
// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/services/upload-image
// ──────────────────────────────────────────────────────────────────────────────
router.post('/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file uploaded' });
        // Build an absolute URL using host from request so it works on any IP
        const protocol = req.protocol;
        const host = req.get('host') || `localhost:3000`;
        const fileUrl = `${protocol}://${host}/uploads/menu-images/${req.file.filename}`;
        res.status(200).json({ url: fileUrl });
    }
    catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});
// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/services/menu-items
// Query params:
//   section   = "services" | "dining" | "local_guide"  (optional — omit for all)
//   scheduled = "true"  (optional — apply schedule window filter, for Portal TV use)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/menu-items', async (req, res) => {
    try {
        const { section, scheduled } = req.query;
        const where = { hotelId: MOCK_HOTEL_ID, isActive: true };
        if (section)
            where.section = section;
        const items = await prisma.guestMenuItem.findMany({
            where,
            orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        });
        // Apply schedule window filter only if caller requests it (Portal TV sends ?scheduled=true)
        const result = scheduled === 'true'
            ? items.filter(isScheduleActive)
            : items;
        res.status(200).json(result);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch menu items' });
    }
});
// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/services/menu-items/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/menu-items/:id', async (req, res) => {
    try {
        const item = await prisma.guestMenuItem.findUnique({ where: { id: req.params.id } });
        if (!item)
            return res.status(404).json({ error: 'Not found' });
        res.status(200).json(item);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch menu item' });
    }
});
// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/services/menu-items
// ──────────────────────────────────────────────────────────────────────────────
router.post('/menu-items', async (req, res) => {
    try {
        await ensureHotel();
        const { section, name, subtitle, icon, color, displayType, displayContent, bgImage, activeFrom, activeUntil, } = req.body;
        if (!section || !name || !displayType || !displayContent) {
            return res.status(400).json({
                error: 'section, name, displayType, displayContent are required',
            });
        }
        const count = await prisma.guestMenuItem.count({
            where: { hotelId: MOCK_HOTEL_ID, section },
        });
        const item = await prisma.guestMenuItem.create({
            data: {
                hotelId: MOCK_HOTEL_ID,
                section,
                name,
                subtitle: subtitle ?? null,
                icon: icon ?? null,
                color: color ?? null,
                displayType,
                displayContent,
                bgImage: bgImage ?? null,
                sortOrder: count,
                activeFrom: activeFrom ? new Date(activeFrom) : null,
                activeUntil: activeUntil ? new Date(activeUntil) : null,
            },
        });
        // 🔴 WebSocket: notify all connected TVs
        emitMenuRefresh(req, 'created', item);
        res.status(201).json(item);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create menu item' });
    }
});
// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/services/menu-items/:id
// ──────────────────────────────────────────────────────────────────────────────
router.put('/menu-items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, subtitle, icon, color, displayType, displayContent, bgImage, isActive, sortOrder, activeFrom, activeUntil, } = req.body;
        const updated = await prisma.guestMenuItem.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(subtitle !== undefined && { subtitle }),
                ...(icon !== undefined && { icon }),
                ...(color !== undefined && { color }),
                ...(displayType !== undefined && { displayType }),
                ...(displayContent !== undefined && { displayContent }),
                ...(bgImage !== undefined && { bgImage }),
                ...(isActive !== undefined && { isActive }),
                ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
                // scheduling — explicit null clears the field
                ...(activeFrom !== undefined && { activeFrom: activeFrom ? new Date(activeFrom) : null }),
                ...(activeUntil !== undefined && { activeUntil: activeUntil ? new Date(activeUntil) : null }),
                updatedAt: new Date(),
            },
        });
        // 🔴 WebSocket: notify all connected TVs
        emitMenuRefresh(req, 'updated', updated);
        res.status(200).json(updated);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update menu item' });
    }
});
// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/services/menu-items/:id
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/menu-items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Optionally delete the physical image file if it was uploaded locally
        const item = await prisma.guestMenuItem.findUnique({ where: { id } });
        if (item?.bgImage) {
            const localPath = item.bgImage.replace(/^.*\/uploads\//, '');
            const fullPath = path_1.default.join(__dirname, '../../../uploads', localPath);
            if (fs_1.default.existsSync(fullPath) && localPath.startsWith('menu-images/')) {
                fs_1.default.unlinkSync(fullPath);
            }
        }
        await prisma.guestMenuItem.delete({ where: { id } });
        // 🔴 WebSocket: notify all connected TVs
        emitMenuRefresh(req, 'deleted', { id });
        res.status(200).json({ message: 'Deleted successfully', id });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete menu item' });
    }
});
// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/services/menu-items/reorder
// Body: { items: [{ id: string, sortOrder: number }] }
// ──────────────────────────────────────────────────────────────────────────────
router.put('/menu-items/reorder', async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'items array required' });
        }
        await Promise.all(items.map(({ id, sortOrder }) => prisma.guestMenuItem.update({ where: { id }, data: { sortOrder } })));
        // 🔴 WebSocket: notify all connected TVs
        emitMenuRefresh(req, 'reordered');
        res.status(200).json({ message: 'Reordered successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reorder' });
    }
});
// ── Legacy routes (kept for backward compatibility) ──────────────────────────
router.get('/', (_req, res) => {
    res.status(200).json({ hotelInfo: {}, facilities: [], promotions: [] });
});
router.get('/room-service', (_req, res) => {
    res.status(200).json({ categories: [], items: [] });
});
router.post('/room-service/order', (req, res) => {
    res.status(201).json({ message: 'Order placed successfully', orderId: 'ORD-123' });
});
exports.default = router;
