const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const channels = await prisma.channel.findMany();
    
    for (const channel of channels) {
        if (!channel.name) continue;
        
        // Generate a professional looking avatar/logo using the channel name
        const encodedName = encodeURIComponent(channel.name);
        // Using a dark hotel-themed color palette for backgrounds
        const colors = ['1a2a4a', '2a3a6a', '3a4a8a', '4a5a9a', '5a6aaa'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        const logoUrl = `https://ui-avatars.com/api/?name=${encodedName}&background=${randomColor}&color=ffffff&size=512&bold=true`;
        
        await prisma.channel.update({
            where: { id: channel.id },
            data: { logoUrl }
        });
        console.log(`Updated ${channel.name} with placeholder logo.`);
    }
    console.log("Done updating all channels with placeholder logos.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
