/**
 * Seed script: migrates hardcoded portal-frontend menu items into DB
 * Run: npx ts-node scripts/seed-menu-items.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';

async function main() {
  await prisma.hotel.upsert({
    where: { id: HOTEL_ID },
    update: {},
    create: { id: HOTEL_ID, name: 'Grand Horizon Hotel', code: 'GH001' }
  });

  // Clear existing
  await prisma.guestMenuItem.deleteMany({ where: { hotelId: HOTEL_ID } });

  const items = [
    // ── SERVICES ──
    {
      section: 'services', sortOrder: 0,
      name: 'Ice Bath & Sauna', subtitle: 'Health declaration',
      icon: '🧊', color: 'bg-gradient-to-br from-[#0a1a2a] to-[#1a3a5a]',
      displayType: 'QR_CODE',
      displayContent: 'https://forms.hotel.com/health-declaration',
      bgImage: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80'
    },
    {
      section: 'services', sortOrder: 1,
      name: 'Spa & Massage', subtitle: '09:00 – 22:00',
      icon: '💆', color: 'bg-gradient-to-br from-[#2a0a2a] to-[#5a1a5a]',
      displayType: 'TEXT_INFO',
      displayContent: JSON.stringify({ hours: '09:00 – 22:00 daily', info: 'Please book at least 2 hours in advance.', contact: 'Ext. 400' }),
      bgImage: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80'
    },
    {
      section: 'services', sortOrder: 2,
      name: 'Housekeeping', subtitle: 'Interactive Request',
      icon: '🛎️', color: 'bg-gradient-to-br from-[#1a1a2a] to-[#3a3a5a]',
      displayType: 'SERVICE_REQUEST',
      displayContent: JSON.stringify([
        { id: 'h1', name: 'Fresh Towel', icon: 'dry_cleaning' },
        { id: 'h2', name: 'Soap / Shower Gel', icon: 'soap' },
        { id: 'h3', name: 'Bottle of Water', icon: 'water_drop' },
        { id: 'h4', name: 'Extra Pillow', icon: 'bed' }
      ]),
      bgImage: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'
    },

    // ── DINING ──
    {
      section: 'dining', sortOrder: 0,
      name: 'In-Room Dining', subtitle: 'Available 24 hours',
      icon: '🍽️', color: 'bg-gradient-to-br from-[#1a2a4a] to-[#2a3a6a]',
      displayType: 'QR_CODE',
      displayContent: 'https://menu.hotel.com/room-dining',
      bgImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80'
    },
    {
      section: 'dining', sortOrder: 1,
      name: 'Breakfast Buffet', subtitle: '06:30 – 10:30',
      icon: '🥐', color: 'bg-gradient-to-br from-[#2a1a0a] to-[#4a3020]',
      displayType: 'TEXT_INFO',
      displayContent: JSON.stringify({ hours: '06:30 – 10:30 (Mon-Fri) / 11:00 (Sat-Sun)', price: 'THB 850 net per person', highlight: 'Live Egg Station · Thai Classics' }),
      bgImage: 'https://images.unsplash.com/photo-1525648199074-cee30ba79a4a?w=800&q=80'
    },
    {
      section: 'dining', sortOrder: 2,
      name: 'Happy Hour', subtitle: '17:00 – 20:00',
      icon: '🍹', color: 'bg-gradient-to-br from-[#2a0a1a] to-[#6a2040]',
      displayType: 'IMAGE_ONLY',
      displayContent: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
      bgImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80'
    },

    // ── LOCAL GUIDE ──
    {
      section: 'local_guide', sortOrder: 0,
      name: 'EmQuartier & Emporium', subtitle: 'Shopping',
      icon: '🛍️', color: 'bg-gradient-to-br from-[#1a0a3a] to-[#3a1a6a]',
      displayType: 'IMAGE_ONLY',
      displayContent: 'https://images.unsplash.com/photo-1582035974465-b1ab1ccfdfd5?w=1200&q=80',
      bgImage: 'https://images.unsplash.com/photo-1582035974465-b1ab1ccfdfd5?w=800&q=80'
    },
    {
      section: 'local_guide', sortOrder: 1,
      name: 'Benchasiri Park', subtitle: 'Nature',
      icon: '🌳', color: 'bg-gradient-to-br from-[#0a2a0a] to-[#1a5a1a]',
      displayType: 'IMAGE_ONLY',
      displayContent: 'https://images.unsplash.com/photo-1542202652-32a2491b29a2?w=1200&q=80',
      bgImage: 'https://images.unsplash.com/photo-1542202652-32a2491b29a2?w=800&q=80'
    },
    {
      section: 'local_guide', sortOrder: 2,
      name: 'BTS Phrom Phong', subtitle: 'Transit',
      icon: '🚊', color: 'bg-gradient-to-br from-[#1a2a0a] to-[#3a5a10]',
      displayType: 'TEXT_INFO',
      displayContent: JSON.stringify({ distance: '450 meters (approx 6 min walk)', hours: '05:30 – 00:00 daily', fare: 'Asok/Nana: 25 THB · Siam: 35 THB' }),
      bgImage: 'https://images.unsplash.com/photo-1542202652-32a2491b29a2?w=800&q=80'
    }
  ];

  for (const item of items) {
    await prisma.guestMenuItem.create({ data: { hotelId: HOTEL_ID, ...item } });
  }

  console.log(`✅ Seeded ${items.length} guest menu items`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
