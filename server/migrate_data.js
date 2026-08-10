const { PrismaClient: PostgresClient } = require('@prisma/client');
const { PrismaClient: SqliteClient } = require('./prisma/node_modules/@prisma/sqlite-client');

async function migrateRemaining() {
    console.log("Starting data migration for remaining tables...");
    const postgres = new PostgresClient();
    const sqlite = new SqliteClient();

    // 1. Update Hotel Settings
    try {
        console.log("Updating hotel settings...");
        const sqliteHotel = await sqlite.hotel.findFirst();
        if (sqliteHotel) {
            await postgres.hotel.updateMany({
                data: {
                    settings: sqliteHotel.settings
                }
            });
            console.log("  Successfully updated hotel settings!");
        }
    } catch(e) {
        console.error("  Failed to update hotel:", e.message);
    }

    const tables = [
        'guestRequest',
        'savedMessage',
        'activeBroadcast',
        'guestMenuItem'
    ];

    for (const table of tables) {
        console.log(`Migrating ${table}...`);
        try {
            const rows = await sqlite[table].findMany();
            if (rows.length === 0) {
                console.log(`  No rows in ${table}`);
                continue;
            }

            console.log(`  Found ${rows.length} rows.`);
            
            // Delete existing rows in postgres to prevent conflicts
            await postgres[table].deleteMany({});
            
            // Insert rows using createMany
            await postgres[table].createMany({
                data: rows
            });
            console.log(`  Successfully inserted into ${table}`);
        } catch (e) {
            console.error(`  Failed to migrate ${table}:`, e.message);
        }
    }

    console.log("Migration complete!");
    await postgres.$disconnect();
    await sqlite.$disconnect();
}

migrateRemaining().catch(console.error);
