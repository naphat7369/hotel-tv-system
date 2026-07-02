"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const path_1 = __importDefault(require("path"));
const socket_1 = require("./websocket/socket");
const cron_service_1 = require("./services/cron.service");
const stream_service_1 = require("./services/stream.service");
const device_routes_1 = __importDefault(require("./api/device.routes"));
const channel_routes_1 = __importDefault(require("./api/channel.routes"));
const app_routes_1 = __importDefault(require("./api/app.routes"));
const screen_routes_1 = __importDefault(require("./api/screen.routes"));
const epg_routes_1 = __importDefault(require("./api/epg.routes"));
const service_routes_1 = __importDefault(require("./api/service.routes"));
const analytics_routes_1 = __importDefault(require("./api/analytics.routes"));
const request_routes_1 = __importDefault(require("./api/request.routes"));
const mdm_routes_1 = __importDefault(require("./api/mdm.routes"));
const broadcast_routes_1 = __importDefault(require("./api/broadcast.routes"));
const pms_routes_1 = __importDefault(require("./api/pms.routes"));
const settings_routes_1 = __importDefault(require("./api/settings.routes"));
const streaming_app_routes_1 = __importDefault(require("./api/streaming-app.routes"));
const webhook_routes_1 = __importDefault(require("./api/webhook.routes"));
const upload_routes_1 = __importDefault(require("./api/upload.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
const httpServer = (0, http_1.createServer)(app);
// Initialize WebSocket
const io = (0, socket_1.initWebSocket)(httpServer);
app.set('io', io); // Allow routes to access io if needed
// Initialize Cron Jobs
(0, cron_service_1.initCronJobs)(io);
// Initialize Stream Probing Service
stream_service_1.StreamService.init(io);
// Middleware
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: false })); // Allow cross-origin static file serving
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve Static Files — covers /uploads/logos, /uploads/menu-images, /uploads/apks, etc.
// CORS is open (helmet crossOriginResourcePolicy: false) so TV portals can load images cross-origin.
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../../uploads'), {
    maxAge: '7d', // Cache images on TV for 7 days
    etag: true,
    lastModified: true,
}));
// Routes
app.use('/api/v1/devices', device_routes_1.default);
app.use('/api/v1/channels', channel_routes_1.default);
app.use('/api/v1/apps', app_routes_1.default);
app.use('/api/v1/screens', screen_routes_1.default);
app.use('/api/v1/epg', epg_routes_1.default);
app.use('/api/v1/services', service_routes_1.default);
app.use('/api/v1/analytics', analytics_routes_1.default);
app.use('/api/v1/requests', request_routes_1.default);
app.use('/api/v1/mdm', mdm_routes_1.default);
app.use('/api/v1/broadcast', broadcast_routes_1.default);
app.use('/api/v1/pms', pms_routes_1.default);
app.use('/api/v1/webhooks/pms', webhook_routes_1.default);
app.use('/api/v1/settings', settings_routes_1.default);
app.use('/api/v1/streaming-apps', streaming_app_routes_1.default);
app.use('/api/v1/upload', upload_routes_1.default);
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Hotel TV Server is running' });
});
// Start Server
httpServer.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
exports.default = app;
