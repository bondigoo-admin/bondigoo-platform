const dotenv = require('dotenv');
const path  = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load environment variables from .env.development
dotenv.config({ path: path.join(__dirname, '.env.development') });

// Import Payment model
const Payment = require('./models/Payment');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the .env.development file.');
  process.exit(1);
}

async function findAllRecords(model) {
  return model.find().lean();
}

async function exportPayments() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const payments = await findAllRecords(Payment);
    console.log(`${payments.length} Payment records found`);

    const outputFile = path.join(__dirname, 'payments.json');
    fs.writeFileSync(outputFile, JSON.stringify(payments, null, 2));
    console.log(`Payment records exported successfully to ${outputFile}`);

  } catch (error) {
    console.error('Error exporting Payment records:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

exportPayments();