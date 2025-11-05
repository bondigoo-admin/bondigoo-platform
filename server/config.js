const dotenv = require('dotenv');
const path = require('path');

// Load environment variables based on NODE_ENV
dotenv.config({
  path: path.resolve(__dirname, `.env.${process.env.NODE_ENV || 'development'}`)
});

module.exports = {
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  server: {
    port: process.env.PORT || 5000,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '1d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  browser: process.env.BROWSER || 'msedge',
  allowTestAccounts: process.env.ALLOW_TEST_ACCOUNTS === 'true',
};