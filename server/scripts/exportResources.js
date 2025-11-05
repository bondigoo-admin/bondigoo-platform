const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Resource model
const Resource = require('./models/Resource');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportResources() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const resources = await findAllRecords(Resource);
    console.log(`${resources.length} Resource records found`);

    const outputFile = path.join(__dirname, 'resources.json');
    fs.writeFileSync(outputFile, JSON.stringify(resources, null, 2));
    console.log(`Resource records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Resource records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportResources();