const path = require('path');
const dotenv = require('dotenv');
const Redis = require('ioredis');

// --- FIX: LOAD THE CORRECT ENVIRONMENT VARIABLES ---
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

// --- FIX: Check for HOST and PORT instead of URL ---
if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
  console.error('ERROR: REDIS_HOST or REDIS_PORT is not defined in your environment variables. The script cannot connect.');
  process.exit(1);
}

// --- FIX: Use HOST and PORT to create the connection, matching your server.js ---
const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  db: 0, // <-- ADD THIS LINE
  maxRetriesPerRequest: null, // Recommended for scripts
});

async function cleanupOrphanedJobs() {
  console.log('Starting cleanup of orphaned BullMQ repeatable jobs...');
  let cursor = '0';
  let keysDeleted = 0;
  const keyPattern = 'bull:*:repeat:*'; // Target all repeatable jobs for all queues

  try {
    do {
      // Using a larger COUNT can be faster for cleanup tasks
      const [nextCursor, keys] = await connection.scan(cursor, 'MATCH', keyPattern, 'COUNT', 1000);
      cursor = nextCursor;

      if (keys.length > 0) {
        const pipeline = connection.pipeline();
        keys.forEach(key => pipeline.del(key));
        await pipeline.exec();
        keysDeleted += keys.length;
        console.log(`Deleted ${keys.length} keys. Total deleted so far: ${keysDeleted}`);
      }
    } while (cursor !== '0');

    console.log(`\n--- Cleanup complete! Total orphaned repeatable job keys deleted: ${keysDeleted} ---\n`);
  } catch (error) {
    console.error('An error occurred during cleanup:', error);
  } finally {
    connection.quit();
  }
}

cleanupOrphanedJobs();