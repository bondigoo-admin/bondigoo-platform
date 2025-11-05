const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Translation model
const Translation = require('./models/Translation');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportTranslations() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const translations = await findAllRecords(Translation);
    console.log(`${translations.length} Translation records found`);

    const outputFile = path.join(__dirname, 'translations.json');
    fs.writeFileSync(outputFile, JSON.stringify(translations, null, 2));
    console.log(`Translation records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Translation records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportTranslations();