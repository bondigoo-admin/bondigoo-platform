import io from 'socket.io-client';

const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000');

class MockWebSocketService {
  constructor() {
    this.listeners = {};
    this.connected = false;
  }

  connect(userId) {
    console.log('Mock WebSocket connected for user:', userId);
    this.connected = true;
    // Simulate connection event
    if (this.listeners['connect']) {
      this.listeners['connect'].forEach(callback => callback());
    }
  }

  disconnect() {
    console.log('Mock WebSocket disconnected');
    this.connected = false;
    // Simulate disconnect event
    if (this.listeners['disconnect']) {
      this.listeners['disconnect'].forEach(callback => callback());
    }
  }

  emit(event, data) {
    console.log(`Mock emit: ${event}`, data);
    // Simulate receiving a response
    setTimeout(() => {
      if (event === 'instant_session_request') {
        this.simulateEvent('instant_session_response', { requestId: Date.now(), status: 'pending' });
      }
    }, 1000);
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  updateStatus(status) {
    console.log('Mock status update:', status);
    this.simulateEvent('status_update', { status });
  }

  sendInstantSessionRequest(coachId, sessionDetails) {
    console.log('Mock instant session request:', { coachId, sessionDetails });
    this.simulateEvent('instant_session_request', { coachId, sessionDetails, requestId: Date.now() });
  }

  respondToInstantSessionRequest(requestId, response) {
    console.log('Mock respond to instant session:', { requestId, response });
    this.simulateEvent('instant_session_response', { requestId, response });
  }

  simulateEvent(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
}

export default new MockWebSocketService();