const SOCKET_CONFIG = {
  connection: {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    autoConnect: true,
    transports: ['websocket', 'polling']
  },
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  path: '/socket.io'
};

const ERROR_CODES = {
  CONNECT_ERROR: 'connect_error',
  CONNECT_TIMEOUT: 'connect_timeout',
  DISCONNECT: 'disconnect'
};

module.exports = {
  SOCKET_CONFIG,
  ERROR_CODES
};