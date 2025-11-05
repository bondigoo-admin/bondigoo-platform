// scripts/createAdminUser.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Determine which .env file to use
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

console.log('Current working directory:', process.cwd());
console.log('Full path of .env file:', path.resolve(__dirname, '..', envFile));
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI);

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the environment variables');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('Error connecting to MongoDB:', err);
  process.exit(1);
});

const createAdminUser = async () => {
  const email = 'admin22@example.com';
  const password = 'adminsecure';

  try {
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: email,
      password: await bcrypt.hash(password, 10),
      role: 'admin',
      preferredLanguage: 'en', // Add this line
      // Add any other required fields here
    });

    await adminUser.save();
    console.log('Admin user created successfully');
    console.log('Login credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

createAdminUser();