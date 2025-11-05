const connectDB = require('./dbConnect');

const testConnection = async () => {
  await connectDB(process.env.NODE_ENV);
  console.log('Connection successful!');
  process.exit(0);
};

testConnection();