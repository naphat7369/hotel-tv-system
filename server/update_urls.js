const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const channels = await prisma.channel.findMany();
    console.log("Current channels:", channels.map(c => c.name));
    
    const updates = {
        'S31': 'http://10.0.101.254/live/0001/index.m3u8',
        'CH.3': 'http://10.0.101.254/live/0002/index.m3u8',
        'Thairath': 'http://10.0.101.254/live/0003/index.m3u8',
        'CH.7': 'http://10.0.101.254/live/0004/index.m3u8',
        'CH.9': 'http://10.0.101.254/live/0005/index.m3u8',
        'CGTN': 'http://10.0.101.254/live/0006/index.m3u8',
        'Aljazeera': 'http://10.0.101.254/live/0007/index.m3u8',
        'HNK World': 'http://10.0.101.254/live/0008/index.m3u8',
        'NHK G': 'http://10.0.101.254/live/0009/index.m3u8'
    };

    for (const [name, url] of Object.entries(updates)) {
        await prisma.channel.updateMany({
            where: { name: name },
            data: { 
                streamUrl: url,
                inputProtocol: 'HTTP',
                streamType: 'HLS'
            }
        });
        console.log(`Updated ${name} to ${url}`);
    }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
