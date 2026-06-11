import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../../uploads/apks');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
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
router.post('/upload', upload.single('apkFile'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file is not an APK' });
  }

  res.json({
    message: 'File uploaded successfully',
    file: {
      filename: req.file.filename,
      size: req.file.size,
      url: `/uploads/apks/${req.file.filename}`
    }
  });
});

// DELETE /api/v1/apps/:filename
router.delete('/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);

  // Prevent directory traversal attacks
  if (!filePath.startsWith(uploadDir)) {
    return res.status(403).json({ error: 'Forbidden' });
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
