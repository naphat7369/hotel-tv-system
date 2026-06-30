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
// Middleware to mock hotelId for now since there's no auth
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';
const ensureHotel = async () => {
    const hotel = await prisma.hotel.findUnique({ where: { id: MOCK_HOTEL_ID } });
    if (!hotel) {
        await prisma.hotel.create({
            data: {
                id: MOCK_HOTEL_ID,
                name: 'Grand Horizon Hotel',
                code: 'GH001'
            }
        });
    }
};
// Configure Multer for logo uploads
const uploadDir = path_1.default.join(__dirname, '../../../uploads/logos');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `logo-${uniqueSuffix}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only images are allowed'));
        }
    }
});
// GET /api/v1/channels - List all channels
router.get('/', async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({
            where: { hotelId: MOCK_HOTEL_ID },
            orderBy: { channelNumber: 'asc' }
        });
        res.status(200).json(channels);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});
// POST /api/v1/channels/upload-logo - Upload a channel logo
router.post('/upload-logo', upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const fileUrl = `http://localhost:3000/uploads/logos/${req.file.filename}`;
        res.status(200).json({ url: fileUrl });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});
// POST /api/v1/channels - Create a new channel
router.post('/', async (req, res) => {
    try {
        await ensureHotel();
        let { name, channelNumber, category, streamUrl, logoUrl, isActive, inputProtocol, inputIp, inputPort, inputEth, outputProtocol, outputIp, outputPort, outputEth } = req.body;
        // Auto-increment sortOrder
        const count = await prisma.channel.count({ where: { hotelId: MOCK_HOTEL_ID } });
        const newChannel = await prisma.channel.create({
            data: {
                hotelId: MOCK_HOTEL_ID,
                name,
                channelNumber: channelNumber ? parseInt(channelNumber) : null,
                category,
                streamUrl,
                logoUrl,
                isActive: isActive !== undefined ? isActive : true,
                sortOrder: count + 1,
                inputProtocol,
                inputIp,
                inputPort: inputPort ? parseInt(inputPort) : null,
                inputEth,
                outputProtocol,
                outputIp,
                outputPort: outputPort ? parseInt(outputPort) : null,
                outputEth
            }
        });
        // Broadcast change
        req.app.get('io')?.emit('refresh_channels', { action: 'created' });
        res.status(201).json(newChannel);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create channel' });
    }
});
// PUT /api/v1/channels/:id - Update a channel
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        if (data.channelNumber)
            data.channelNumber = parseInt(data.channelNumber);
        if (data.inputPort)
            data.inputPort = parseInt(data.inputPort);
        if (data.outputPort)
            data.outputPort = parseInt(data.outputPort);
        const updated = await prisma.channel.update({
            where: { id },
            data
        });
        // Broadcast change
        req.app.get('io')?.emit('refresh_channels', { action: 'updated' });
        res.status(200).json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update channel' });
    }
});
// DELETE /api/v1/channels/:id - Delete a channel
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.channel.delete({ where: { id } });
        // Broadcast change
        req.app.get('io')?.emit('refresh_channels', { action: 'deleted' });
        res.status(200).json({ message: 'Channel deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete channel' });
    }
});
exports.default = router;
