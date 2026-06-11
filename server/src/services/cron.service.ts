import cron from 'node-cron';
import { Server } from 'socket.io';
import { initBroadcastCron } from './broadcast.cron';

export const initCronJobs = (io: Server) => {
  console.log('[Cron] Initializing automated tasks...');

  // 2:00 AM Task: Placeholder for fetching/downloading APKs
  // "0 2 * * *" means every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] [2:00 AM] Running automated App Fetcher task...');
    
    // TODO: Implement logic to scrape or download the latest Netflix/YouTube APKs
    // from a secure source or internal repository and save them to /uploads/apks
    console.log('[Cron] App Fetcher task placeholder executed.');
  });

  // 3:00 AM Task: Trigger silent install to all connected TVs
  // "0 3 * * *" means every day at 3:00 AM
  cron.schedule('0 3 * * *', () => {
    console.log('[Cron] [3:00 AM] Running automated APK installation task...');
    
    // In a real scenario, we would determine the exact filename downloaded by the 2:00 AM task.
    // For now, we assume 'netflix-latest.apk' exists in our static directory.
    const serverIp = process.env.SERVER_IP || '192.168.1.63'; // Replace with actual logic to get Server IP
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
  initBroadcastCron(io);
};
