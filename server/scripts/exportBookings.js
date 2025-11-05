const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Booking model
const Booking = require('./models/Booking');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportBookings() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const bookings = await findAllRecords(Booking);
    console.log(`${bookings.length} Booking records found`);

    const outputFile = path.join(__dirname, 'bookings.json');
    fs.writeFileSync(outputFile, JSON.stringify(bookings, null, 2));
    console.log(`Booking records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Booking records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportBookings();