const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Connection model
const Connection = require('./models/Connection');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportConnections() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const connections = await findAllRecords(Connection);
    console.log(`${connections.length} Connection records found`);

    const outputFile = path.join(__dirname, 'connections.json');
    fs.writeFileSync(outputFile, JSON.stringify(connections, null, 2));
    console.log(`Connection records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Connection records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportConnections();