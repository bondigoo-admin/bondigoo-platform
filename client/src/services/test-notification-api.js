// test-notification-api.js
const fs = require('fs');
const path = require('path');

// Mock the api module
const api = {
  get: (url) => Promise.resolve({ data: { message: 'Mocked API GET response' } }),
  put: (url, data) => Promise.resolve({ data: { message: 'Mocked API PUT response' } }),
  post: (url, data) => Promise.resolve({ data: { message: 'Mocked API POST response' } }),
  delete: (url) => Promise.resolve({ data: { message: 'Mocked API DELETE response' } }),
};

// Mock the logger
const logger = {
  info: console.log,
  error: console.error,
};

// Mock localStorage
global.localStorage = {
  getItem: () => 'mock-token',
};

// Mock fetch
global.fetch = (url, options) => {
  console.log('Fetch called with:', { url, options });
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      success: true,
      notifications: [
        { id: 1, message: 'Test notification 1' },
        { id: 2, message: 'Test notification 2' },
      ],
    }),
  });
};

// Read the content of notificationAPI.js
const notificationAPIPath = path.join(__dirname, 'notificationAPI.js');
const notificationAPIContent = fs.readFileSync(notificationAPIPath, 'utf8');

// Create a function to run the notificationAPI code
function runNotificationAPI(code) {
  const module = { exports: {} };
  const require = (module) => {
    if (module === './api') return api;
    if (module === '../utils/logger') return { logger };
  };
  eval(code);
  return module.exports;
}

// Run the notificationAPI code
const notificationAPI = runNotificationAPI(notificationAPIContent);

// Test functions
async function testNotificationAPI() {
  try {
    console.log('Testing getNotifications:');
    const notifications = await notificationAPI.getNotifications();
    console.log(JSON.stringify(notifications, null, 2));

    console.log('\nTesting markNotificationAsRead:');
    const readResult = await notificationAPI.markNotificationAsRead('123');
    console.log(JSON.stringify(readResult, null, 2));

    console.log('\nTesting batchMarkAsRead:');
    const batchReadResult = await notificationAPI.batchMarkAsRead(['123', '456']);
    console.log(JSON.stringify(batchReadResult, null, 2));
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

testNotificationAPI();