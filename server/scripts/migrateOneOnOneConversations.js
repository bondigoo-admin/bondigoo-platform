const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const { logger } = require('../utils/logger');

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined. Please ensure your .env file is configured correctly.');
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {});
    logger.info('MongoDB Connected for migration...');
  } catch (err) {
    logger.error('MongoDB connection error during migration:', {
        message: err.message,
        stack: err.stack
    });
    process.exit(1);
  }
};

const migrateData = async () => {
  try {
    await connectDB();
    console.log('\nStarting migration of one-on-one conversations to the new membership model...');

    let conversationsProcessed = 0;
    let newMembershipsCreated = 0;
    let membershipsAlreadyExist = 0;
    let conversationsSkipped = 0;
    let conversationsErrored = 0;
    
    const conversationCursor = Conversation.find({ 
      type: { $ne: 'group' },
      'participants.0': { $exists: true } 
    }).cursor();

    for (let conversation = await conversationCursor.next(); conversation != null; conversation = await conversationCursor.next()) {
      try {
        conversationsProcessed++;

        if (conversation.participants.length < 2) {
          logger.warn(`Skipping conversation ${conversation._id} as it is not a valid one-on-one chat. Participants: ${conversation.participants.length}`);
          conversationsSkipped++;
          continue;
        }

        const bulkOps = conversation.participants.map(participantId => ({
          updateOne: {
            filter: { 
              conversationId: conversation._id, 
              userId: participantId 
            },
            update: { 
              $setOnInsert: {
                conversationId: conversation._id,
                userId: participantId,
                role: 'member',
                joinedAt: conversation.createdAt || new Date(),
              }
            },
            upsert: true
          }
        }));

        const result = await ConversationMember.bulkWrite(bulkOps);
        
        newMembershipsCreated += result.upsertedCount;
        membershipsAlreadyExist += result.matchedCount;

        if (result.upsertedCount > 0) {
          console.log(`  - Processed conversation ${conversation._id}: Created ${result.upsertedCount} new memberships.`);
        }
        
        if (conversation.type !== 'one-on-one') {
            await Conversation.updateOne({ _id: conversation._id }, { $set: { type: 'one-on-one' } });
        }

      } catch (error) {
        conversationsErrored++;
        logger.error(`  - FAILED to process conversation ${conversation._id}:`, {
            message: error.message,
            stack: error.stack
        });
      }
    }

    console.log(`\n\n--- MIGRATION COMPLETE ---`);
    console.log(`Total one-on-one conversations processed: ${conversationsProcessed}`);
    console.log(`New conversation memberships created:      ${newMembershipsCreated}`);
    console.log(`Memberships that already existed:          ${membershipsAlreadyExist}`);
    console.log(`Conversations skipped (invalid):           ${conversationsSkipped}`);
    console.log(`Conversations with processing errors:      ${conversationsErrored}`);

  } catch (error) {
    console.error('\n--- SCRIPT FAILED ---');
    console.error('An unrecoverable error occurred during the migration process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
};

migrateData();