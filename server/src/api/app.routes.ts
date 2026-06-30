import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
// @ts-ignore
import AppInfoParser from 'app-info-parser';

const router = Router();
const prisma = new PrismaClient();
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
const uploadDir = path.join(__dirname, '../../../uploads/apks');
const iconsDir = path.join(__dirname, '../../../uploads/icons');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but prepend timestamp to prevent overwriting
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.apk') {
      return cb(new Error('Only APK files are allowed!'));
    }
    cb(null, true);
  }
});

// GET /api/v1/apps
// Returns list of available APKs
router.get('/', (req: Request, res: Response) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read directory' });
    }
    
    const apks = files.filter(f => f.endsWith('.apk')).map(file => {
      const stats = fs.statSync(path.join(uploadDir, file));
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
router.post('/upload', upload.single('apkFile'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file is not an APK' });
  }

  const apkPath = path.join(uploadDir, req.file.filename);
  let appName = req.file.originalname;
  let packageName = '';
  let iconUrl = '';

  try {
    const parser = new AppInfoParser(apkPath);
    const result = await parser.parse();
    
    appName = result.application?.label?.[0] || result.application?.label || appName;
    packageName = result.package;

    if (result.icon) {
      // Save base64 icon to file
      const iconData = result.icon.replace(/^data:image\/\w+;base64,/, '');
      const iconBuffer = Buffer.from(iconData, 'base64');
      const iconFilename = `${Date.now()}-${packageName || 'app'}.png`;
      fs.writeFileSync(path.join(iconsDir, iconFilename), iconBuffer);
      iconUrl = `/uploads/icons/${iconFilename}`;
    }
  } catch (err) {
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
  } catch (dbErr) {
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
router.delete('/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

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
  } catch (err) {
    console.error('[DB] Failed to delete StreamingApp record:', err);
  }

  fs.unlink(filePath, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      return res.status(500).json({ error: 'Failed to delete file' });
    }
    res.json({ message: 'File deleted successfully' });
  });
});

export default router;
