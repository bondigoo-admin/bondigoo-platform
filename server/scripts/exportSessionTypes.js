const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import SessionType model
const SessionType = require('./models/SessionType');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportSessionTypes() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const sessionTypes = await findAllRecords(SessionType);
    console.log(`${sessionTypes.length} SessionType records found`);

    const outputFile = path.join(__dirname, 'sessionTypes.json');
    fs.writeFileSync(outputFile, JSON.stringify(sessionTypes, null, 2));
    console.log(`SessionType records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting SessionType records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportSessionTypes();