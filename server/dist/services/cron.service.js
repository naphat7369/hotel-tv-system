"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCronJobs = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const os_1 = __importDefault(require("os"));
const broadcast_cron_1 = require("./broadcast.cron");
function getLocalIpAddress() {
    const interfaces = os_1.default.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        if (iface) {
            for (let i = 0; i < iface.length; i++) {
                const alias = iface[i];
                if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                    return alias.address;
                }
            }
        }
    }
    return '127.0.0.1';
}
const initCronJobs = (io) => {
    console.log('[Cron] Initializing automated tasks...');
    // 2:00 AM Task: Placeholder for fetching/downloading APKs
    // "0 2 * * *" means every day at 2:00 AM
    node_cron_1.default.schedule('0 2 * * *', async () => {
        console.log('[Cron] [2:00 AM] Running automated App Fetcher task...');
        // TODO: Implement logic to scrape or download the latest Netflix/YouTube APKs
        // from a secure source or internal repository and save them to /uploads/apks
        console.log('[Cron] App Fetcher task placeholder executed.');
    });
    // 3:00 AM Task: Trigger silent install to all connected TVs
    // "0 3 * * *" means every day at 3:00 AM
    node_cron_1.default.schedule('0 3 * * *', () => {
        console.log('[Cron] [3:00 AM] Running automated APK installation task...');
        // In a real scenario, we would determine the exact filename downloaded by the 2:00 AM task.
        // For now, we assume 'netflix-latest.apk' exists in our static directory.
        const serverIp = process.env.SERVER_IP || getLocalIpAddress();
        const port = process.env.PORT || 3000;
        const downloadUrl = `http://${serverIp}:${port}/uploads/apks/netflix-latest.apk`;
        // Broadcast the install_apk command to all connected WebSockets
        console.log(`[Cron] Broadcasting install_apk command: ${downloadUrl}`);
        io.emit('mdm_command', {
            action: 'mdm_command',
            command: 'install_apk',
            payload: {
                url: downloadUrl,
                packageName: 'com.netflix.ninja', // Example package
                version: 'latest'
            }
        });
    });
    // Initialize Broadcast Scheduling Cron
    (0, broadcast_cron_1.initBroadcastCron)(io);
    // 4:00 AM Task: Analytics Data Retention Cleanup (Delete data older than 6 months)
    node_cron_1.default.schedule('0 4 * * *', async () => {
        console.log('[Cron] [4:00 AM] Running automated Analytics Cleanup task...');
        try {
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const deleted = await prisma.usageEvent.deleteMany({
                where: {
                    timestamp: {
                        lt: sixMonthsAgo
                    }
                }
            });
            console.log(`[Cron] Deleted ${deleted.count} old analytics records.`);
            await prisma.$disconnect();
        }
        catch (err) {
            console.error('[Cron] Failed to cleanup analytics:', err);
        }
    });
};
exports.initCronJobs = initCronJobs;
