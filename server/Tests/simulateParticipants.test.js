const puppeteer = require('puppeteer');
const assert = require('assert');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    dumpio: true, // Capture all browser console logs
    protocolTimeout: 300000, // Increase timeout to 300 seconds for WSL2
  });
  const page = await browser.newPage();

  console.log('Starting Puppeteer simulation with detailed logging at:', new Date().toISOString());

  // Navigate to your client app (login page)
  try {
    console.log('Navigating to login page: http://localhost:3000/login...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 90000 });
    console.log('Successfully navigated to http://localhost:3000/login at:', new Date().toISOString());
  } catch (err) {
    console.error('Navigation error to login page:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }

  // Simulate login to get a valid token with detailed logging
  let token;
  try {
    console.log('Simulating login to get token at:', new Date().toISOString());
    const loginResult = await page.evaluate(() => {
      return new Promise((resolve) => {
        console.log('Evaluating login form presence at:', new Date().toISOString());
        const form = document.querySelector('form.login-form');
        if (form) {
          console.log('Login form found, filling credentials at:', new Date().toISOString());
          console.log('Form HTML:', form.outerHTML.slice(0, 500) + '...');
          form.querySelector('input[name="email"]').value = 'test.user2@example.com';
          form.querySelector('input[name="password"]').value = 'test.user2@example.com';
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Submitting login form at:', new Date().toISOString());
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
              console.log('Submit button found, clicking at:', new Date().toISOString());
              submitButton.click();
            } else {
              console.error('Submit button not found at:', new Date().toISOString());
            }
          }, { once: true });
          window.addEventListener('load', () => {
            console.log('Window load event triggered at:', new Date().toISOString());
            const token = localStorage.getItem('token');
            console.log('[Login Simulation] Token retrieved at:', new Date().toISOString(), token ? token.slice(0, 8) + '...' : 'No token found');
            resolve(token);
          }, { once: true });
          console.log('Dispatching submit event at:', new Date().toISOString());
          form.dispatchEvent(new Event('submit', { bubbles: true }));
        } else {
          console.error('Login form not found at:', new Date().toISOString());
          console.log('Document body:', document.body.innerHTML.slice(0, 500) + '...');
          resolve(null);
        }
      });
    }, { timeout: 120000 }); // Extend evaluation timeout to 120 seconds
    token = loginResult;
    if (!token) throw new Error('Login failed or token not found at:', new Date().toISOString());
    console.log('Login successful, token obtained at:', new Date().toISOString(), token.slice(0, 8) + '...');
  } catch (err) {
    console.error('Login simulation error:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }

  // Navigate to the video conference page after login
  try {
    console.log('Navigating to video conference page: http://localhost:3000 at:', new Date().toISOString());
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 90000 });
    console.log('Successfully navigated to video conference page at:', new Date().toISOString());
  } catch (err) {
    console.error('Navigation to video conference error:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }

  // Simulate 5 participants with the obtained token
  const participants = 5;
  const connections = [];

  for (let i = 0; i < participants; i++) {
    try {
      const newPage = await browser.newPage();
      console.log(`Participant ${i + 1} creating new page at:`, new Date().toISOString());
      await newPage.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 90000 });
      console.log(`Participant ${i + 1} navigated to login page successfully at:`, new Date().toISOString());

      // Simulate login for each participant with detailed logging
      let participantToken;
      try {
        console.log(`Simulating login for Participant ${i + 1} at:`, new Date().toISOString());
        participantToken = await newPage.evaluate((index) => {
          return new Promise((resolve) => {
            console.log(`Evaluating login form for Participant ${index} at:`, new Date().toISOString());
            const form = document.querySelector('form.login-form');
            if (form) {
              console.log(`Login form found for Participant ${index}, filling credentials at:`, new Date().toISOString());
              console.log('Form HTML:', form.outerHTML.slice(0, 500) + '...');
              form.querySelector('input[name="email"]').value = 'test.user2@example.com';
              form.querySelector('input[name="password"]').value = 'test.user2@example.com';
              form.addEventListener('submit', (e) => {
                e.preventDefault();
                console.log(`Submitting login form for Participant ${index} at:`, new Date().toISOString());
                const submitButton = form.querySelector('button[type="submit"]');
                if (submitButton) {
                  console.log(`Submit button found for Participant ${index}, clicking at:`, new Date().toISOString());
                  submitButton.click();
                } else {
                  console.error(`Submit button not found for Participant ${index} at:`, new Date().toISOString());
                }
              }, { once: true });
              window.addEventListener('load', () => {
                console.log(`Window load event for Participant ${index} triggered at:`, new Date().toISOString());
                const token = localStorage.getItem('token');
                console.log(`[Login Simulation] Token retrieved for Participant ${index} at:`, new Date().toISOString(), token ? token.slice(0, 8) + '...' : 'No token found');
                resolve(token);
              }, { once: true });
              console.log(`Dispatching submit event for Participant ${index} at:`, new Date().toISOString());
              form.dispatchEvent(new Event('submit', { bubbles: true }));
            } else {
              console.error(`Login form not found for Participant ${index} at:`, new Date().toISOString());
              console.log('Document body:', document.body.innerHTML.slice(0, 500) + '...');
              resolve(null);
            }
          });
        }, i + 1, { timeout: 120000 }); // Extend evaluation timeout to 120 seconds
        if (!participantToken) throw new Error(`Login failed or token not found for Participant ${i + 1} at:`, new Date().toISOString());
        console.log(`Login successful for Participant ${i + 1}, token obtained at:`, new Date().toISOString(), participantToken.slice(0, 8) + '...');
      } catch (err) {
        console.error(`Login simulation error for Participant ${i + 1}:`, {
          message: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
        });
        throw err;
      }

      // Navigate to video conference page for each participant
      try {
        console.log(`Navigating Participant ${i + 1} to video conference page: http://localhost:3000 at:`, new Date().toISOString());
        await newPage.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 90000 });
        console.log(`Participant ${i + 1} navigated to video conference page successfully at:`, new Date().toISOString());
      } catch (err) {
        console.error(`Navigation to video conference error for Participant ${i + 1}:`, {
          message: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
        });
        throw err;
      }

      // Simulate joining a call with the valid token and detailed logging
      const joinResult = await newPage.evaluate((participantIndex, participantToken) => {
        console.log(`Attempting to join call for Participant ${participantIndex} with token at:`, new Date().toISOString());
        console.log('Document structure:', document.body.innerHTML.slice(0, 500) + '...');
        const joinButton = document.querySelector('#join-call');
        console.log('Join button found at:', new Date().toISOString(), !!joinButton, 'State:', joinButton ? { disabled: joinButton.disabled, textContent: joinButton.textContent } : 'Not found');
        if (joinButton) {
          console.log('Join button clicked at:', new Date().toISOString());
          joinButton.click();
        } else {
          console.log('No join button found, simulating socket and app state at:', new Date().toISOString());
          const socket = window.io?.sockets[window.location.pathname] || window.socketRef?.current;
          if (socket) {
            console.log('Emulating socket join at:', new Date().toISOString(), socket.id);
            socket.emit('join-session', { 
              sessionId: window.location.pathname.split('/').pop() || 'default-session',
              displayName: `TestUser${participantIndex}`,
              peerId: socket.id,
              token: participantToken,
              isCoach: false // Match your app’s default for testing
            });
          } else {
            console.log('No socket found, triggering app state initialization at:', new Date().toISOString());
            window.startSession = window.startSession || (() => {});
            window.startSession({ 
              sessionId: window.location.pathname.split('/').pop() || 'default-session',
              token: participantToken,
              displayName: `TestUser${participantIndex}`,
              isCoach: false
            });
          }
        }
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            const socket = window.io?.sockets[window.location.pathname] || window.socketRef?.current;
            const isConnected = window.isConnected || (window.participants && window.participants.length > 0);
            console.log('Checking connection at:', new Date().toISOString(), { socketConnected: socket?.connected, isConnected, participants: window.participants });
            if (socket?.connected || isConnected) {
              clearInterval(checkInterval);
              console.log('Connection established at:', new Date().toISOString());
              resolve(true);
            }
          }, 2000);
          setTimeout(() => {
            clearInterval(checkInterval);
            console.log('Connection check timed out at:', new Date().toISOString());
            resolve(false);
          }, 120000); // 120s timeout for join (max extended for WSL2)
        });
      }, i + 1, participantToken, { timeout: 120000 }); // Extend evaluation timeout to 120 seconds
      console.log(`Participant ${i + 1} join attempt completed at:`, new Date().toISOString(), joinResult);

      if (!joinResult) {
        console.warn(`Participant ${i + 1} join timed out, retrying with extended delay at:`, new Date().toISOString());
        await newPage.reload({ waitUntil: 'networkidle2', timeout: 90000 });
        await newPage.evaluate((participantIndex, participantToken) => {
          console.log(`Retrying join for Participant ${participantIndex} at:`, new Date().toISOString());
          const socket = window.io?.sockets[window.location.pathname] || window.socketRef?.current;
          if (socket) {
            console.log(`Emulating socket retry join at:`, new Date().toISOString(), socket.id);
            socket.emit('join-session', { 
              sessionId: window.location.pathname.split('/').pop() || 'default-session',
              displayName: `TestUser${participantIndex}`,
              peerId: socket.id,
              token: participantToken,
              isCoach: false
            });
          }
        }, i + 1, participantToken, { timeout: 120000 });
        await new Promise(resolve => setTimeout(resolve, 60000)); // 60s retry delay
      }

      connections.push(newPage);
      console.log(`Participant ${i + 1} joined at:`, new Date().toISOString());
    } catch (err) {
      console.error(`Participant ${i + 1} join error at:`, {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  // Wait for connections to stabilize with extended delay
  console.log('Waiting for connections to stabilize (180 seconds) at:', new Date().toISOString());
  await new Promise(resolve => setTimeout(resolve, 180000));
  console.log('Connections stabilization complete at:', new Date().toISOString());

  // Verify connections using socket.io, app state, and retry logic with detailed logging
  for (const page of connections) {
    try {
      const debugInfo = await page.evaluate((pageIndex) => {
        console.log(`Debugging connection state for Participant ${pageIndex} at:`, new Date().toISOString());
        // Check socket.io connection (from useVideoConference.js)
        const socket = window.io?.sockets[window.location.pathname] || window.socketRef?.current;
        console.log('Socket state at:', new Date().toISOString(), socket ? { connected: socket.connected, id: socket.id, events: Object.keys(socket._callbacks || {}).filter(e => e.includes('connect') || e.includes('session')) } : 'No socket found');

        // Check app-specific state from useVideoConference.js
        const isConnected = window.isConnected || (window.participants && window.participants.length > 0) || (window.localStream && window.localStream.active);
        console.log('App-specific isConnected at:', new Date().toISOString(), isConnected, 'Participants:', window.participants, 'LocalStream:', window.localStream);

        // Check for any UI indicators (fallback)
        const connectionIndicators = [
          document.querySelector('#connection-status'),
          document.querySelector('.connected'),
          document.querySelector('[data-connected]'),
        ].filter(Boolean);
        const statusText = connectionIndicators.length ? connectionIndicators.map(el => ({ text: el.textContent, attributes: el.attributes })) : 'No connection indicators found';
        console.log('Connection UI indicators at:', new Date().toISOString(), statusText);

        // Wait for connection with retries and socket events
        let connected = false;
        if (socket && socket.connected) {
          connected = true;
          console.log('Connected via socket at:', new Date().toISOString());
        } else if (isConnected) {
          connected = true;
          console.log('Connected via app-specific state at:', new Date().toISOString());
        } else {
          console.log('No immediate connection detected, waiting for session-participants or state at:', new Date().toISOString());
          return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              const updatedSocket = window.io?.sockets[window.location.pathname] || window.socketRef?.current;
              const updatedIsConnected = window.isConnected || (window.participants && window.participants.length > 0);
              console.log('Checking connection retry at:', new Date().toISOString(), { socketConnected: updatedSocket?.connected, isConnected: updatedIsConnected, participants: window.participants });
              if (updatedSocket?.connected || updatedIsConnected) {
                clearInterval(checkInterval);
                console.log('Connection established after retry at:', new Date().toISOString());
                resolve({ connected: true, debug: { socket: updatedSocket, isConnected: updatedIsConnected, statusText } });
              }
            }, 2000);
            setTimeout(() => {
              clearInterval(checkInterval);
              console.log('Connection check timed out after retries at:', new Date().toISOString());
              resolve({ connected: false, debug: { socket, isConnected, statusText } });
            }, 120000); // 120s timeout for retries
          });
        }
        return { connected, debug: { socket, isConnected, statusText } };
      }, connections.indexOf(page) + 1, { timeout: 120000 }); // Extend evaluation timeout to 120 seconds
      if (debugInfo instanceof Promise) {
        debugInfo = await debugInfo;
      }
      console.log(`Debug info for participant ${connections.indexOf(page) + 1} at:`, new Date().toISOString(), debugInfo.debug);
      assert(debugInfo.connected, `Participant connection failed for page ${connections.indexOf(page) + 1} at:`, new Date().toISOString());
      console.log(`Participant ${connections.indexOf(page) + 1} connection verified at:`, new Date().toISOString());
    } catch (err) {
      console.error(`Participant ${connections.indexOf(page) + 1} verification error at:`, {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  // Clean up with logging
  console.log('Cleaning up pages and browser at:', new Date().toISOString());
  for (const page of connections) {
    try {
      await page.close();
      console.log('Page closed successfully at:', new Date().toISOString());
    } catch (err) {
      console.error('Page cleanup error at:', {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      });
    }
  }
  try {
    await browser.close();
    console.log('Browser closed successfully at:', new Date().toISOString());
  } catch (err) {
    console.error('Browser cleanup error at:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }
  console.log('Simulation completed at:', new Date().toISOString());
})().catch(err => console.error('Simulation failed at:', {
  message: err.message,
  stack: err.stack,
  timestamp: new Date().toISOString(),
}));