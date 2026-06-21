import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import path from 'path';
import { initWebSocket } from './websocket/socket';
import { initCronJobs } from './services/cron.service';
import { StreamService } from './services/stream.service';

import deviceRoutes from './api/device.routes';
import channelRoutes from './api/channel.routes';
import appRoutes from './api/app.routes';
import screenRoutes from './api/screen.routes';
import epgRoutes from './api/epg.routes';
import serviceRoutes from './api/service.routes';
import analyticsRoutes from './api/analytics.routes';
import requestRoutes from './api/request.routes';
import mdmRoutes from './api/mdm.routes';
import broadcastRoutes from './api/broadcast.routes';
import pmsRoutes from './api/pms.routes';
import settingsRoutes from './api/settings.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const httpServer = createServer(app);

// Initialize WebSocket
const io = initWebSocket(httpServer);
app.set('io', io); // Allow routes to access io if needed

// Initialize Cron Jobs
initCronJobs(io);

// Initialize Stream Probing Service
StreamService.init(io);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false })); // Allow cross-origin static file serving
app.use(cors());
app.use(express.json());

// Serve Static Files — covers /uploads/logos, /uploads/menu-images, /uploads/apks, etc.
// CORS is open (helmet crossOriginResourcePolicy: false) so TV portals can load images cross-origin.
app.use('/uploads', express.static(path.join(__dirname, '../../uploads'), {
  maxAge: '7d',          // Cache images on TV for 7 days
  etag: true,
  lastModified: true,
}));

// Routes
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/channels', channelRoutes);
app.use('/api/v1/apps', appRoutes);
app.use('/api/v1/screens', screenRoutes);
app.use('/api/v1/epg', epgRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/mdm', mdmRoutes);
app.use('/api/v1/broadcast', broadcastRoutes);
app.use('/api/v1/pms', pmsRoutes);
app.use('/api/v1/settings', settingsRoutes);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Hotel TV Server is running' });
});

// Start Server
httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
