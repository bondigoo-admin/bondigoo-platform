// server/scripts/encrypt-existing-messages.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// --- 1. SETUP: Load Environment & Models ---
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const encryptionService = require('../utils/encryptionService');

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined. Please ensure your .env file is configured correctly.');
  process.exit(1);
}

if (!process.env.ENCRYPTION_MASTER_KEY) {
  console.error('FATAL: ENCRYPTION_MASTER_KEY is not set in your environment variables.');
  process.exit(1);
}

const migrateData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    console.log('\nStarting migration of existing conversations and messages...');

    const unencryptedConversations = await Conversation.find({ encryptionKey: { $exists: false } });

    if (unencryptedConversations.length === 0) {
      console.log('No unencrypted conversations found. Migration is not needed.');
      return;
    }

    console.log(`Found ${unencryptedConversations.length} conversations to migrate.`);
    let conversationsMigrated = 0;
    let messagesMigrated = 0;

    for (const conversation of unencryptedConversations) {
      try {
        console.log(`\nProcessing conversation ${conversation._id}...`);

        const newDEK = encryptionService.generateDEK();
        const encryptedDEK = encryptionService.encryptDEK(newDEK);
        
        conversation.encryptionKey = encryptedDEK;
        await conversation.save();
        console.log(`  - Saved new encryption key for conversation.`);

        const messagesToEncrypt = await Message.find({
          conversationId: conversation._id,
          contentType: 'text',
        });

        if (messagesToEncrypt.length > 0) {
            const messageUpdatePromises = messagesToEncrypt.map(message => {
                if (message.content) {
                    const encryptedContent = encryptionService.encrypt(message.content, newDEK);
                    message.content = encryptedContent;
                    return message.save();
                }
                return Promise.resolve();
            });
            await Promise.all(messageUpdatePromises);
            messagesMigrated += messagesToEncrypt.length;
            console.log(`  - Successfully encrypted ${messagesToEncrypt.length} messages.`);
        } else {
            console.log(`  - No text messages found to encrypt for this conversation.`);
        }

        conversationsMigrated++;
      } catch (error) {
        console.error(`  - FAILED to migrate conversation ${conversation._id}:`, error.message);
      }
    }

    console.log(`\n\n--- MIGRATION COMPLETE ---`);
    console.log(`Successfully migrated ${conversationsMigrated} conversations and ${messagesMigrated} messages.`);

  } catch (error) {
    console.error('\n--- SCRIPT FAILED ---');
    console.error('An error occurred during the migration process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

migrateData();