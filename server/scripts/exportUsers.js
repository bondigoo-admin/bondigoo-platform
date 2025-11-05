const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import User model
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportUsers() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const users = await findAllRecords(User);
    console.log(`${users.length} User records found`);

    const outputFile = path.join(__dirname, 'users.json');
    fs.writeFileSync(outputFile, JSON.stringify(users, null, 2));
    console.log(`User records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting User records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportUsers();