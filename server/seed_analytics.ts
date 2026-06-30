import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';

async function generateMockAnalytics() {
  console.log('Generating mock analytics data...');
  
  // Clear existing to avoid duplicates if run multiple times
  await prisma.usageEvent.deleteMany({});
  
  let devices = await prisma.device.findMany({ select: { id: true } });
  if (devices.length === 0) {
    console.log('No devices found, creating a dummy device...');
    const newDevice = await prisma.device.create({
      data: {
        hotelId: MOCK_HOTEL_ID,
        boxSerial: 'DUMMY-001',
        ipAddress: '192.168.1.100',
        isOnline: true
      }
    });
    devices = [newDevice];
  }
  
  const now = new Date();
  const events = [];

  // Helper to get random device
  const getRandomDevice = () => devices[Math.floor(Math.random() * devices.length)].id;

  // 1. Channel Watches
  const channels = [
    { id: 'ch1', name: 'BBC News' },
    { id: 'ch2', name: 'HBO Max' },
    { id: 'ch3', name: 'Discovery' },
    { id: 'ch4', name: 'Fox Sports' },
    { id: 'ch5', name: 'Disney+' }
  ];

  for (let i = 0; i < 50; i++) {
    const ch = channels[Math.floor(Math.random() * channels.length)];
    events.push({
      hotelId: MOCK_HOTEL_ID,
      deviceId: getRandomDevice(),
      eventType: 'CHANNEL_WATCH',
      value: JSON.stringify({ channelId: ch.id, name: ch.name }),
      durationSeconds: Math.floor(Math.random() * 7200) + 300, // 5 mins to 2 hours
      timestamp: new Date(now.getTime() - Math.random() * 86400000 * 7) // Last 7 days
    });
  }

  // 2. App Opens
  const apps = ['Netflix', 'YouTube', 'Spotify', 'Prime Video'];
  for (let i = 0; i < 40; i++) {
    const app = apps[Math.floor(Math.random() * apps.length)];
    events.push({
      hotelId: MOCK_HOTEL_ID,
      deviceId: getRandomDevice(),
      eventType: 'APP_OPEN',
      value: JSON.stringify({ appName: app }),
      timestamp: new Date(now.getTime() - Math.random() * 86400000 * 7)
    });
  }

  // 3. Menu Clicks
  const menus = ['Live TV', 'Room Service', 'Local Guide', 'Settings', 'Messages'];
  for (let i = 0; i < 80; i++) {
    const menu = menus[Math.floor(Math.random() * menus.length)];
    events.push({
      hotelId: MOCK_HOTEL_ID,
      deviceId: getRandomDevice(),
      eventType: 'MENU_CLICK',
      value: JSON.stringify({ menu: menu }),
      timestamp: new Date(now.getTime() - Math.random() * 86400000 * 7)
    });
  }

  await prisma.usageEvent.createMany({ data: events });
  console.log('Mock analytics generated successfully!');
}

generateMockAnalytics().catch(console.error).finally(() => prisma.$disconnect());
