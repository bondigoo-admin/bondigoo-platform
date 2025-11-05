import api from './api';
import io from 'socket.io-client';

let socket;

export const connectSocket = (userId) => {
  if (!socket) {
    socket = io(process.env.REACT_APP_API_URL, {
      query: { userId },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      //console.log('[Socket] Connected successfully');
    });

    socket.on('connect_error', (error) => {
      //console.error('[Socket] Connection error:', error);
    });

    socket.on('disconnect', (reason) => {
      //console.log('[Socket] Disconnected:', reason);
    });
  }
  return socket;
};

export const requestConnection = async (targetUserId) => {
  try {
    //console.log(`[connectionAPI] Requesting connection with user: ${targetUserId}`);
    const response = await api.post('/api/connections/request', { targetUserId });
    //console.log('[connectionAPI] Connection request response:', response.data);
    return response.data;
  } catch (error) {
    //console.error('[connectionAPI] Error requesting connection:', error);
    if (error.response) {
      //console.error('[connectionAPI] Error response:', error.response.data);
      if (error.response.status === 404) {
        throw new Error(error.response.data.message || 'User not found');
      }
    }
    throw error;
  }
};

export const respondToConnection = async ({ connectionId, status }) => {
  try {
    //console.log(`[connectionAPI] Responding to connection ${connectionId} with status: ${status}`);
    const response = await api.post(`/api/connections/${connectionId}/respond`, { status });
    //console.log('[connectionAPI] Connection response update:', response.data);
    return response.data;
  } catch (error) {
    //console.error('[connectionAPI] Error responding to connection:', error);
    throw error;
  }
};

export const getUserConnections = async () => {
  try {
    //console.log('[connectionAPI] Fetching user connections');
    const response = await api.get('/api/connections/user');
    //console.log('[connectionAPI] User connections fetched:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    //console.error('[connectionAPI] Error fetching user connections:', error);
    throw error;
  }
};

export const cancelConnectionRequest = async (connectionId) => {
  try {
    //console.log(`[connectionAPI] Cancelling connection request: ${connectionId}`);
    const response = await api.delete(`/api/connections/${connectionId}/cancel`);
    //console.log('[connectionAPI] Connection request cancelled:', response.data);
    return response.data;
  } catch (error) {
    //console.error('[connectionAPI] Error cancelling connection request:', error);
    if (error.response) {
      //console.error('[connectionAPI] Error response:', error.response.data);
    }
    throw error;
  }
};

export const getConnectionStatus = async (targetUserId) => {
  try {
    if (!targetUserId) {
      //console.error('[connectionAPI] Target user ID is undefined');
      return { status: 'not_connected' };
    }
    //console.log(`[connectionAPI] Fetching connection status for target user: ${targetUserId}`);
    const response = await api.get(`/api/connections/status/${targetUserId}`);
    //console.log('[connectionAPI] Connection status response:', response.data);
    return response.data; // CHANGED: Return the full { status, connection } object
  } catch (error) {
    //console.error('[connectionAPI] Error fetching connection status:', error);
    if (error.response && error.response.status === 404) {
      //console.warn('[connectionAPI] Connection not found, returning not_connected');
      return { status: 'not_connected' }; // CHANGED: Return an object for consistency
    }
    throw error;
  }
};

export const removeConnection = async (connectionId) => {
  try {
    const response = await api.delete(`/api/connections/${connectionId}/remove`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const subscribeToConnectionRequests = (callback) => {
  if (socket) {
    socket.on('connection_request', callback);
  }
};

export const subscribeToConnectionResponses = (callback) => {
  if (socket) {
    socket.on('connection_response', callback);
  }
};

export default {
  requestConnection,
  connectSocket,
  respondToConnection,
  getUserConnections,
  getConnectionStatus,
  cancelConnectionRequest,
  removeConnection,
  subscribeToConnectionRequests,
  subscribeToConnectionResponses,
};