const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import all models
const Achievement = require('./models/Achievement');
const Booking = require('./models/Booking');
const Client = require('./models/Client');
const Coach = require('./models/Coach');
const CoachingStyle = require('./models/CoachingStyle');
const Connection = require('./models/Connection');
const EducationLevel = require('./models/EducationLevel');
const Language = require('./models/Language');
const Notification = require('./models/Notification');
const Package = require('./models/Package');
const Payment = require('./models/Payment');
const Resource = require('./models/Resource');
const Review = require('./models/Review');
const SessionType = require('./models/SessionType');
const Skill = require('./models/Skill');
const Specialty = require('./models/Specialty');
const Translation = require('./models/Translation');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportAllRecords() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const models = [
      { name: 'Achievement', model: Achievement },
      { name: 'Booking', model: Booking },
      { name: 'Client', model: Client },
      { name: 'Coach', model: Coach },
      { name: 'CoachingStyle', model: CoachingStyle },
      { name: 'Connection', model: Connection },
      { name: 'EducationLevel', model: EducationLevel },
      { name: 'Language', model: Language },
      { name: 'Notification', model: Notification },
      { name: 'Package', model: Package },
      { name: 'Payment', model: Payment },
      { name: 'Resource', model: Resource },
      { name: 'Review', model: Review },
      { name: 'SessionType', model: SessionType },
      { name: 'Skill', model: Skill },
      { name: 'Specialty', model: Specialty },
      { name: 'Translation', model: Translation },
      { name: 'User', model: User },
    ];

    const allRecords = {};

    for (const { name, model } of models) {
      const records = await findAllRecords(model);
      allRecords[name] = records;
      console.log(`${records.length} ${name} records found`);
    }

    const outputFile = path.join(__dirname, 'all_records.json');
    fs.writeFileSync(outputFile, JSON.stringify(allRecords, null, 2));
    console.log(`All records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting all records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportAllRecords();