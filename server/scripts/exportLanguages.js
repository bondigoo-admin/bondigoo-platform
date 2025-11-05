const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Language model
const Language = require('./models/Language');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportLanguages() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const languages = await findAllRecords(Language);
    console.log(`${languages.length} Language records found`);

    const outputFile = path.join(__dirname, 'languages.json');
    fs.writeFileSync(outputFile, JSON.stringify(languages, null, 2));
    console.log(`Language records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Language records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportLanguages();