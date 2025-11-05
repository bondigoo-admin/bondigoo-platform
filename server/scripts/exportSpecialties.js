const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Specialty model
const Specialty = require('./models/Specialty');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportSpecialties() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const specialties = await findAllRecords(Specialty);
    console.log(`${specialties.length} Specialty records found`);

    const outputFile = path.join(__dirname, 'specialties.json');
    fs.writeFileSync(outputFile, JSON.stringify(specialties, null, 2));
    console.log(`Specialty records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Specialty records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportSpecialties();