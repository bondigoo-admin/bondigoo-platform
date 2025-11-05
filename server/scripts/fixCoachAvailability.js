// fixCoachAvailability.js
const mongoose = require('mongoose');
const config = require('./config');
const Coach = require('./models/Coach');

const fixCoachAvailability = async () => {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('Connected to MongoDB');

    const coaches = await Coach.find({});
    
    for (const coach of coaches) {
      if (!Array.isArray(coach.availability)) {
        coach.availability = [];
        await coach.save();
        console.log(`Fixed availability for coach: ${coach._id}`);
      }
    }

    console.log('All coach documents have been fixed');
  } catch (error) {
    console.error('Error fixing coach availability:', error);
  } finally {
    await mongoose.connection.close();
  }
};

fixCoachAvailability();