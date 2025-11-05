const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./config');
const User = require('./models/User');

const seedDatabase = async () => {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});

    // Create test accounts
    const testAccounts = [
      { firstName: 'Admin', lastName: 'User', email: 'admin@example.com', password: 'admin', role: 'admin', preferredLanguage: 'en' },
      { firstName: 'Test', lastName: 'User', email: 'user@example.com', password: 'user', role: 'client', preferredLanguage: 'en' },
      { firstName: 'Test', lastName: 'Coach', email: 'coach@example.com', password: 'coach', role: 'coach', preferredLanguage: 'en' },
    ];

    // Hash passwords and insert users
    const hashedUsers = await Promise.all(testAccounts.map(async (user) => {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);
      return { ...user, password: hashedPassword };
    }));

    await User.insertMany(hashedUsers);
    console.log('Database seeded with test accounts');

    // Seed other users (if any)
    const regularUsers = [
      { firstName: 'John', lastName: 'Doe', email: 'john@example.com', password: 'password123', role: 'client', preferredLanguage: 'en' },
      { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', password: 'password123', role: 'coach', preferredLanguage: 'en' },
      // Add more seed data as needed
    ];

    const hashedRegularUsers = await Promise.all(regularUsers.map(async (user) => {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);
      return { ...user, password: hashedPassword };
    }));

    await User.insertMany(hashedRegularUsers);
    console.log('Database seeded successfully');

    mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();