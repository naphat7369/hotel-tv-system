import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const router = Router();

const uploadDir = path.join(__dirname, '../../../uploads/images');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Keep original file in memory to process with Sharp, then we will save it to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// POST /api/v1/upload/image
router.post('/image', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `img-${uniqueSuffix}.webp`;
    const outputPath = path.join(uploadDir, filename);

    // Process image with Sharp
    // 1. Resize to max 1920x1080 (maintaining aspect ratio, but avoiding massive files)
    // 2. Convert to WebP for optimization
    await sharp(req.file.buffer)
      .resize({
        width: 1920,
        height: 1080,
        fit: sharp.fit.inside,
        withoutEnlargement: true
      })
      .webp({ quality: 80 })
      .toFile(outputPath);

    const fileUrl = `/uploads/images/${filename}`;
    res.status(200).json({ url: fileUrl });
  } catch (error) {
    console.error('[Upload API] Error processing image:', error);
    res.status(500).json({ error: 'Failed to process and upload image' });
  }
});

export default router;
