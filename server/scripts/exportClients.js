const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Client model
const Client = require('./models/Client');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportClients() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const clients = await findAllRecords(Client);
    console.log(`${clients.length} Client records found`);

    const outputFile = path.join(__dirname, 'clients.json');
    fs.writeFileSync(outputFile, JSON.stringify(clients, null, 2));
    console.log(`Client records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Client records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportClients();