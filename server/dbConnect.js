const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async (env = 'development') => {
  const connectionString = process.env.MONGODB_URI;

  console.log('Attempting to connect to MongoDB...');
  console.log('Environment:', env);

  try {
    await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`MongoDB Connected: ${mongoose.connection.host}`);
    console.log(`Database Name: ${mongoose.connection.name}`);
    
    // Test the connection by trying to list collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Log the Mongoose connection state
    console.log('Mongoose connection state:', mongoose.connection.readyState);

  } catch (error) {
    console.error('Error connecting to MongoDB:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.name === 'MongoServerError') {
      console.error('MongoDB Server Error Code:', error.code);
      console.error('MongoDB Server Error Message:', error.errmsg);
    }
    
    if (error.name === 'MongoParseError') {
      console.error('MongoDB Parse Error:', error.message);
      console.error('Please check your MONGODB_URI in the .env file');
    }

    console.error('Full error object:', error);

    // Terminate the process with a non-zero exit code
    process.exit(1);
  }
};

module.exports = connectDB;