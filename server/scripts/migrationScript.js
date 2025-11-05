// migrationScript.js
const mongoose = require('mongoose');
const config = require('./config');
const Coach = require('./models/Coach');

const migrateCoachAvailability = async () => {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('Connected to MongoDB');

    const coaches = await Coach.find({});
    
    for (const coach of coaches) {
      if (!Array.isArray(coach.availability)) {
        coach.availability = [];
        await coach.save();
        console.log(`Updated availability for coach: ${coach._id}`);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await mongoose.connection.close();
  }
};

migrateCoachAvailability();