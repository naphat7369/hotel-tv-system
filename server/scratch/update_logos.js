const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const prisma = new PrismaClient();

async function main() {
    const channels = await prisma.channel.findMany();
    
    for (const channel of channels) {
        if (!channel.name) continue;
        
        console.log(`Processing ${channel.name}...`);
        const query = `${channel.name} tv channel logo png transparent`;
        
        try {
            const output = execSync(
                `/home/itadmin/hotel-tv-system/uploads/logos/venv/bin/python /home/itadmin/hotel-tv-system/server/scratch/download_logo.py "${query}" "${channel.name}"`,
                { encoding: 'utf-8' }
            );
            
            const lines = output.split('\n');
            let successPath = null;
            for (const line of lines) {
                if (line.startsWith('SUCCESS:')) {
                    successPath = line.split('SUCCESS:')[1].trim();
                    break;
                } else if (line.startsWith('ERROR:')) {
                    console.log(`  ${line}`);
                }
            }
            
            if (successPath) {
                await prisma.channel.update({
                    where: { id: channel.id },
                    data: { logoUrl: successPath }
                });
                console.log(`  Updated ${channel.name} with logo ${successPath}`);
            }
        } catch (e) {
            console.error(`  Failed to execute script for ${channel.name}:`, e.message);
        }
    }
    console.log("Done updating logos.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
