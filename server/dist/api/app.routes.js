"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
// @ts-ignore
const app_info_parser_1 = __importDefault(require("app-info-parser"));
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
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
// Ensure uploads directory exists
const uploadDir = path_1.default.join(__dirname, '../../../uploads/apks');
const iconsDir = path_1.default.join(__dirname, '../../../uploads/icons');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
if (!fs_1.default.existsSync(iconsDir)) {
    fs_1.default.mkdirSync(iconsDir, { recursive: true });
}
// Configure multer storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Keep original filename but prepend timestamp to prevent overwriting
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (path_1.default.extname(file.originalname).toLowerCase() !== '.apk') {
            return cb(new Error('Only APK files are allowed!'));
        }
        cb(null, true);
    }
});
// GET /api/v1/apps
// Returns list of available APKs
router.get('/', (req, res) => {
    fs_1.default.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read directory' });
        }
        const apks = files.filter(f => f.endsWith('.apk')).map(file => {
            const stats = fs_1.default.statSync(path_1.default.join(uploadDir, file));
            return {
                filename: file,
                size: stats.size,
                createdAt: stats.birthtime,
                url: `/uploads/apks/${file}` // URL accessible by TVs
            };
        });
        // Sort by newest first
        apks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        res.json(apks);
    });
});
// POST /api/v1/apps/upload
// Upload a new APK file
router.post('/upload', upload.single('apkFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or file is not an APK' });
    }
    const apkPath = path_1.default.join(uploadDir, req.file.filename);
    let appName = req.file.originalname;
    let packageName = '';
    let iconUrl = '';
    try {
        const parser = new app_info_parser_1.default(apkPath);
        const result = await parser.parse();
        appName = result.application?.label?.[0] || result.application?.label || appName;
        packageName = result.package;
        if (result.icon) {
            // Save base64 icon to file
            const iconData = result.icon.replace(/^data:image\/\w+;base64,/, '');
            const iconBuffer = Buffer.from(iconData, 'base64');
            const iconFilename = `${Date.now()}-${packageName || 'app'}.png`;
            fs_1.default.writeFileSync(path_1.default.join(iconsDir, iconFilename), iconBuffer);
            iconUrl = `/uploads/icons/${iconFilename}`;
        }
    }
    catch (err) {
        console.warn('[APK Parser] Failed to parse APK details:', err);
    }
    // Create StreamingApp entry
    try {
        await ensureHotel();
        const count = await prisma.streamingApp.count({ where: { hotelId: MOCK_HOTEL_ID } });
        await prisma.streamingApp.create({
            data: {
                hotelId: MOCK_HOTEL_ID,
                name: appName,
                packageName: packageName,
                iconUrl: iconUrl,
                deepLink: `/uploads/apks/${req.file.filename}`, // Use deepLink to store APK URL
                sortOrder: count + 1,
                isActive: true
            }
        });
    }
    catch (dbErr) {
        console.error('[DB] Failed to create StreamingApp record:', dbErr);
    }
    res.json({
        message: 'File uploaded successfully',
        file: {
            filename: req.file.filename,
            size: req.file.size,
            url: `/uploads/apks/${req.file.filename}`,
            appName,
            packageName,
            iconUrl
        }
    });
});
// DELETE /api/v1/apps/:filename
router.delete('/:filename', async (req, res) => {
    const { filename } = req.params;
    const filePath = path_1.default.join(uploadDir, filename);
    // Prevent directory traversal attacks
    if (!filePath.startsWith(uploadDir)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    // Delete associated StreamingApp from DB
    try {
        const apkUrl = `/uploads/apks/${filename}`;
        await prisma.streamingApp.deleteMany({
            where: { deepLink: apkUrl }
        });
    }
    catch (err) {
        console.error('[DB] Failed to delete StreamingApp record:', err);
    }
    fs_1.default.unlink(filePath, (err) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).json({ error: 'File not found' });
            }
            return res.status(500).json({ error: 'Failed to delete file' });
        }
        res.json({ message: 'File deleted successfully' });
    });
});
exports.default = router;
