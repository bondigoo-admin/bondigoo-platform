const mongoose = require('mongoose');
const User = require('../server/models/User'); // Adjust the path as needed
const config = require('../server/config'); // Adjust the path as needed

// Ensure MongoDB URI is defined in config
if (!config.mongodb || !config.mongodb.uri) {
  throw new Error('MongoDB URI is not defined in the config file');
}

// Connect to MongoDB
mongoose.connect(config.mongodb.uri, {
  serverSelectionTimeoutMS: 30000 // Increase timeout to 30 seconds
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit the process with failure code
  });

async function updateUserRoles() {
  try {
    console.log('Starting updateUserRoles...');

    // Update coach role
    const coachUpdate = await User.findOneAndUpdate(
      { email: 'coach@example.com' },
      { $set: { role: 'coach' } },
      { new: true, runValidators: true }
    );
    if (coachUpdate) {
      console.log('Coach role updated');
    } else {
      console.log('Coach not found');
    }

    // Update admin role
    const adminUpdate = await User.findOneAndUpdate(
      { email: 'admin@example.com' },
      { $set: { role: 'admin' } },
      { new: true, runValidators: true }
    );
    if (adminUpdate) {
      console.log('Admin role updated');
    } else {
      console.log('Admin not found');
    }

    console.log('User roles updated successfully');
  } catch (err) {
    console.error('Error updating user roles:', err);
  } finally {
    mongoose.disconnect()
      .then(() => console.log('MongoDB disconnected'))
      .catch(err => console.error('Error disconnecting from MongoDB:', err));
  }
}

// Call the function to update user roles
updateUserRoles();
