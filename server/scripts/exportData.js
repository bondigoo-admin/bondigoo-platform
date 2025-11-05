const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import all models
const Booking = require('./models/Booking');
const Notification = require('./models/Notification');
/*const Achievement = require('./models/Achievement');
const Client = require('./models/Client');
const Coach = require('./models/Coach');
const CoachingStyle = require('./models/CoachingStyle');
const Connection = require('./models/Connection');
const EducationLevel = require('./models/EducationLevel');
const Language = require('./models/Language');
const Package = require('./models/Package');
const Payment = require('./models/Payment');
const Resource = require('./models/Resource');
const Review = require('./models/Review');
const SessionType = require('./models/SessionType');
const Skill = require('./models/Skill');
const Specialty = require('./models/Specialty');
const Translation = require('./models/Translation');
const User = require('./models/User');*/

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function exportData() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const outputDir = path.join(__dirname, 'data_export');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const models = [
      { name: 'Booking', model: Booking },
      { name: 'Notification', model: Notification },
      /*{ name: 'Achievement', model: Achievement },
      { name: 'Client', model: Client },
      { name: 'Coach', model: Coach },
      { name: 'CoachingStyle', model: CoachingStyle },
      { name: 'Connection', model: Connection },
      { name: 'EducationLevel', model: EducationLevel },
      { name: 'Language', model: Language },
      { name: 'Package', model: Package },
      { name: 'Payment', model: Payment },
      { name: 'Resource', model: Resource },
      { name: 'Review', model: Review },
      { name: 'SessionType', model: SessionType },
      { name: 'Skill', model: Skill },
      { name: 'Specialty', model: Specialty },
      { name: 'Translation', model: Translation },
      { name: 'User', model: User },*/
    ];

    for (const { name, model } of models) {
      const data = await model.find({}).lean();
      fs.writeFileSync(
        path.join(outputDir, `${name.toLowerCase()}.json`),
        JSON.stringify(data, null, 2)
      );
      console.log(`${name} data exported successfully`);
    }

  } catch (error) {
    console.error('Error exporting data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportData();