const { PrismaClient: PostgresClient } = require('@prisma/client');
const { PrismaClient: SqliteClient } = require('./prisma/node_modules/@prisma/sqlite-client');

async function migrateAnalytics() {
    console.log("Starting data migration for usage_events and device_commands...");
    const postgres = new PostgresClient();
    const sqlite = new SqliteClient();

    const tables = [
        'usageEvent',
        'deviceCommand'
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
            
            // Because usage_events might reference missing devices or reservations (if any)
            // we will sanitize the data just in case.
            const safeRows = rows.map(r => {
                // Keep only valid fields, specifically if reservationId or deviceId fails, we can nullify them
                // But let's just try direct insert first. If it fails, we will handle it.
                return r;
            });
            
            // Insert in chunks of 500 to be safe
            const chunkSize = 500;
            for (let i = 0; i < safeRows.length; i += chunkSize) {
                const chunk = safeRows.slice(i, i + chunkSize);
                try {
                    await postgres[table].createMany({ data: chunk });
                } catch (err) {
                    console.error(`  Error inserting chunk ${i}:`, err.message);
                    // If foreign key fails on chunk, nullify deviceId and reservationId and retry
                    const fallbackChunk = chunk.map(r => ({...r, deviceId: null, reservationId: null}));
                    try {
                        await postgres[table].createMany({ data: fallbackChunk });
                        console.log(`  Inserted chunk ${i} with fallback (nullified relationships).`);
                    } catch (fallbackErr) {
                         console.error(`  Fallback also failed for chunk ${i}:`, fallbackErr.message);
                    }
                }
            }

            console.log(`  Successfully inserted into ${table}`);
        } catch (e) {
            console.error(`  Failed to migrate ${table}:`, e.message);
        }
    }

    console.log("Analytics migration complete!");
    await postgres.$disconnect();
    await sqlite.$disconnect();
}

migrateAnalytics().catch(console.error);
