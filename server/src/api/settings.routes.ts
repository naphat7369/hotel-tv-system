import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { requireAdminAuth } from '../middleware/admin-auth.middleware';
import { IncidentService } from '../services/incident.service';

const prisma = new PrismaClient();
const router = Router();

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

const uploadDir = path.join(__dirname, '../../../uploads/backgrounds');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Get settings
router.get('/', async (req: Request, res: Response) => {
  try {
    await ensureHotel();
    const hotel = await prisma.hotel.findUnique({ where: { id: MOCK_HOTEL_ID } });
    
    let settings = {};
    if (hotel?.settings) {
      try {
        settings = JSON.parse(hotel.settings);
      } catch (e) {
        console.error("Failed to parse settings JSON");
      }
    }

    res.json({
      hotel_name: hotel?.name || 'GRAND HORIZON',
      ...settings
    });
  } catch (error) {
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
}, async (req: Request, res: Response) => {
  try {
    await ensureHotel();
    const hotel = await prisma.hotel.findUnique({ where: { id: MOCK_HOTEL_ID } });
    
    let currentSettings: any = {};
    if (hotel?.settings) {
      try {
        currentSettings = JSON.parse(hotel.settings);
      } catch (e) {}
    }

    const newSettings = {
      ...currentSettings,
      hotel_stars: req.body.hotel_stars || currentSettings.hotel_stars || '★★★★★',
      loading_title: req.body.loading_title || currentSettings.loading_title || 'PREPARING YOUR EXPERIENCE',
      loading_subtitle: req.body.loading_subtitle || currentSettings.loading_subtitle || 'Establishing secure connection to the hotel network...',
      portal_main_title: req.body.portal_main_title || currentSettings.portal_main_title || 'LUXE',
      portal_subtitle: req.body.portal_subtitle || currentSettings.portal_subtitle || 'Concierge',
      marquee_message: req.body.marquee_message !== undefined ? req.body.marquee_message : currentSettings.marquee_message,
      marquee_speed: req.body.marquee_speed ? parseInt(req.body.marquee_speed) : currentSettings.marquee_speed || 25
    };

    if (req.body.guestServicesEnabled) {
      try {
        const parsedGSE = JSON.parse(req.body.guestServicesEnabled);
        const currentGSE = currentSettings.guestServicesEnabled || { services: true, dining: true, localGuide: true };
        newSettings.guestServicesEnabled = {
          services: typeof parsedGSE.services === 'boolean' ? parsedGSE.services : currentGSE.services,
          dining: typeof parsedGSE.dining === 'boolean' ? parsedGSE.dining : currentGSE.dining,
          localGuide: typeof parsedGSE.localGuide === 'boolean' ? parsedGSE.localGuide : currentGSE.localGuide,
        };
      } catch (err) {
        console.error('Failed to parse guestServicesEnabled field', err);
      }
    }

    if (req.body.guestMenuCategories) {
      try {
        const parsedCategories = JSON.parse(req.body.guestMenuCategories);
        const currentCategories = currentSettings.guestMenuCategories || {};
        newSettings.guestMenuCategories = {
          ...currentCategories,
          ...parsedCategories
        };
      } catch (err) {
        console.error('Failed to parse guestMenuCategories field', err);
      }
    }

    console.log('req.body:', req.body);
    console.log('newSettings:', newSettings);

    // Handle parsed background images list if present
    if (req.body.backgroundImages) {
      try {
        const parsedBgs = JSON.parse(req.body.backgroundImages);
        if (Array.isArray(parsedBgs)) {
          // Limit to 10
          newSettings.backgroundImages = parsedBgs.slice(0, 10);
        }
      } catch (err) {
        console.error('Failed to parse backgroundImages field', err);
      }
    }

    // Map uploaded files to respective fields
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `bg-${uniqueSuffix}.webp`;
        const outputPath = path.join(uploadDir, filename);
        
        await sharp(file.buffer)
          .resize({ width: 1920, height: 1080, fit: sharp.fit.inside, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(outputPath);
          
        const fileUrl = `/uploads/backgrounds/${filename}`;
        
        if (file.fieldname === 'loading_bg_image') {
          newSettings.loading_bg_image = fileUrl;
        } else if (file.fieldname.startsWith('bgImage_')) {
          const tag = file.fieldname.replace('bgImage_', '');
          if (newSettings.backgroundImages) {
            const bgIndex = newSettings.backgroundImages.findIndex((bg: any) => bg.tag === tag);
            if (bgIndex >= 0) {
              newSettings.backgroundImages[bgIndex].url = fileUrl;
            } else if (newSettings.backgroundImages.length < 10) {
              newSettings.backgroundImages.push({ tag, url: fileUrl });
            }
          } else {
             newSettings.backgroundImages = [{ tag, url: fileUrl }];
          }
        }
      }
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
  } catch (error: any) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  INCIDENT NOTIFICATION SETTINGS & MANAGEMENT (Protected by requireAdminAuth)
// ════════════════════════════════════════════════════════════════════════════
router.use('/incidents', requireAdminAuth);

// GET /api/v1/settings/incidents/config
router.get('/incidents/config', async (_req: Request, res: Response) => {
  try {
    try {
      await IncidentService.loadConfigFromDb();
    } catch {
      // Fallback to in-memory / .env defaults if DB temporarily unavailable
    }
    res.json(IncidentService.getPublicConfig());
  } catch (error) {
    console.error('[Settings/Incidents] Failed to get incident config:', error);
    res.status(500).json({ error: 'Failed to fetch incident configuration' });
  }
});

// PUT /api/v1/settings/incidents/config
router.put('/incidents/config', async (req: Request, res: Response) => {
  try {
    const updatedConfig = await IncidentService.updateConfig(req.body || {}, 'cms-admin');
    if (IncidentService.isEnabled()) {
      IncidentService.startBackgroundTimers();
    } else {
      IncidentService.stopBackgroundTimers();
    }
    res.json({
      success: true,
      config: updatedConfig,
    });
  } catch (error) {
    console.error('[Settings/Incidents] Failed to update incident config:', error);
    res.status(500).json({ error: 'Failed to update incident configuration' });
  }
});

// POST /api/v1/settings/incidents/mute
router.post('/incidents/mute', async (req: Request, res: Response) => {
  try {
    const durationMinutes = Number(req.body?.durationMinutes) || 0;
    const { muteUntil } = await IncidentService.setMute(durationMinutes, 'cms-admin');
    res.json({
      success: true,
      muteUntil,
      config: IncidentService.getPublicConfig(),
    });
  } catch (error) {
    console.error('[Settings/Incidents] Failed to update mute state:', error);
    res.status(500).json({ error: 'Failed to update mute settings' });
  }
});

// POST /api/v1/settings/incidents/test
// Works even when main Incident System is disabled (enabled=false) and bypasses Mute
router.post('/incidents/test', async (req: Request, res: Response) => {
  try {
    const channel: 'telegram' | 'email' | 'both' =
      req.body?.channel === 'telegram' || req.body?.channel === 'email'
        ? req.body.channel
        : 'both';
    const result = await IncidentService.sendTestNotification(channel);
    res.json({
      success: result.telegramSent || result.emailSent,
      ...result,
    });
  } catch (error) {
    console.error('[Settings/Incidents] Failed to send test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// GET /api/v1/settings/incidents/recent
router.get('/incidents/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit || '50'), 10) || 50;
    const status = req.query.status ? String(req.query.status) : undefined;
    const severity = req.query.severity ? String(req.query.severity) : undefined;
    const category = req.query.category ? String(req.query.category) : undefined;

    const incidents = await IncidentService.getRecentIncidents({
      limit,
      status,
      severity,
      category,
    });
    res.json({ incidents });
  } catch (error) {
    console.error('[Settings/Incidents] Failed to fetch recent incidents:', error);
    res.status(500).json({ error: 'Failed to fetch recent incidents' });
  }
});

export default router;
