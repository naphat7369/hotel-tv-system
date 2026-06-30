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
const uploadDir = path_1.default.join(__dirname, '../../../uploads/backgrounds');
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
        cb(null, `bg-${uniqueSuffix}${ext}`);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
};
const upload = (0, multer_1.default)({ storage, fileFilter });
// Get settings
router.get('/', async (req, res) => {
    try {
        await ensureHotel();
        const hotel = await prisma.hotel.findUnique({ where: { id: MOCK_HOTEL_ID } });
        let settings = {};
        if (hotel?.settings) {
            try {
                settings = JSON.parse(hotel.settings);
            }
            catch (e) {
                console.error("Failed to parse settings JSON");
            }
        }
        res.json({
            hotel_name: hotel?.name || 'GRAND HORIZON',
            ...settings
        });
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
// Update settings
router.post('/', (req, res, next) => {
    upload.any()(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        await ensureHotel();
        const hotel = await prisma.hotel.findUnique({ where: { id: MOCK_HOTEL_ID } });
        let currentSettings = {};
        if (hotel?.settings) {
            try {
                currentSettings = JSON.parse(hotel.settings);
            }
            catch (e) { }
        }
        const newSettings = {
            ...currentSettings,
            hotel_stars: req.body.hotel_stars || currentSettings.hotel_stars || '★★★★★',
            loading_title: req.body.loading_title || currentSettings.loading_title || 'PREPARING YOUR EXPERIENCE',
            loading_subtitle: req.body.loading_subtitle || currentSettings.loading_subtitle || 'Establishing secure connection to the hotel network...',
            portal_main_title: req.body.portal_main_title || currentSettings.portal_main_title || 'LUXE',
            portal_subtitle: req.body.portal_subtitle || currentSettings.portal_subtitle || 'Concierge'
        };
        // Handle parsed background images list if present
        if (req.body.backgroundImages) {
            try {
                const parsedBgs = JSON.parse(req.body.backgroundImages);
                if (Array.isArray(parsedBgs)) {
                    // Limit to 5
                    newSettings.backgroundImages = parsedBgs.slice(0, 5);
                }
            }
            catch (err) {
                console.error('Failed to parse backgroundImages field', err);
            }
        }
        // Map uploaded files to respective fields
        if (req.files && Array.isArray(req.files)) {
            req.files.forEach((file) => {
                const fileUrl = `/uploads/backgrounds/${file.filename}`;
                if (file.fieldname === 'loading_bg_image') {
                    newSettings.loading_bg_image = fileUrl;
                }
                else if (file.fieldname.startsWith('bgImage_')) {
                    const tag = file.fieldname.replace('bgImage_', '');
                    if (newSettings.backgroundImages) {
                        const bgIndex = newSettings.backgroundImages.findIndex((bg) => bg.tag === tag);
                        if (bgIndex >= 0) {
                            newSettings.backgroundImages[bgIndex].url = fileUrl;
                        }
                        else if (newSettings.backgroundImages.length < 5) {
                            newSettings.backgroundImages.push({ tag, url: fileUrl });
                        }
                    }
                    else {
                        newSettings.backgroundImages = [{ tag, url: fileUrl }];
                    }
                }
            });
        }
        const hotelName = req.body.hotel_name || hotel?.name;
        await prisma.hotel.update({
            where: { id: MOCK_HOTEL_ID },
            data: {
                name: hotelName,
                settings: JSON.stringify(newSettings)
            }
        });
        const io = req.app.get('io');
        if (io) {
            io.emit('refresh_settings');
        }
        res.json({ success: true, settings: newSettings });
    }
    catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
exports.default = router;
