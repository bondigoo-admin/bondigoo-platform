const express = require('express');
const fs = require('fs').promises;
const cookieParser = require('cookie-parser');
const http = require('http');
// REMOVE: const socketIo = require('socket.io');
const cors = require('cors');
const connectDB = require('./dbConnect');
const userRoutes = require('./routes/userRoutes');
const coachRoutes = require('./routes/coachRoutes');
const adminRoutes = require('./routes/adminRoutes');
const config = require('./config');
const languageMiddleware = require('./middleware/languageMiddleware');
const fileUpload = require('express-fileupload');
const connectionRoutes = require('./routes/connectionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const morgan = require('morgan');
const userController = require('./controllers/userController');
const paymentController = require('./controllers/paymentController');
const User = require('./models/User');
const ReminderService = require('./services/reminderService');
const { configureSocket } = require('./socketConfig');
const { logger, requestLogger } = require('./utils/logger');
const paymentRoutes = require('./routes/paymentRoutes');
const stripeService = require('./services/stripeService');
const priceRoutes = require('./routes/priceRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const recordingRoutes = require('./routes/recordingRoutes');
const Redis = require('ioredis');
const path = require('path');
const { cleanupUnusedResources } = require('./cleanupResources');
const reviewRoutes = require('./routes/ReviewRoutes');
const messageRoutes = require('./routes/messageRoutes');
const { SOCKET_EVENTS } = require('./utils/socketEventConstants');

const app = express();
const server = http.createServer(app);

const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5000', 'http://localhost:5001', 'http://localhost:5002'];

const { initializeSocketService } = require('./services/socketService');
const { io, activeConnections, connectionMonitor } = configureSocket(server);

initializeSocketService(io);
logger.info('[Server] SocketNotificationService initialized with io');

const reminderService = new ReminderService(io);

const pendingNotifications = new Map();

// Notification delivery tracking
const notificationDeliveryLog = new Map();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6380,
});
app.set('redis', redis);
logger.info('[Server] Redis initialized', { host: redis.options.host, port: redis.options.port });

app.use(requestLogger);

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.post('/api/payments/webhook', express.raw({type: 'application/json'}), paymentController.webhookHandler);

io.on('connection', (socket) => {
  console.log('[Socket] New client connected');
  
  socket.on('login', async (data) => {
    const userId = data.userId;
    console.log('[Socket] User logged in:', userId);
    socket.join(userId);
    activeConnections.set(userId, socket);

    try {
      await User.findByIdAndUpdate(userId, { $set: { status: 'online' } });
      io.to(userId).emit('status_update', 'online');
    } catch (error) {
      console.error('[Socket] Error updating user status on login:', error);
    }
  });

  socket.on('update_status', async ({ userId, status }) => {
    try {
      console.log(`[Socket] Updating status for user ${userId} to ${status}`);
      const updatedStatus = await userController.updateUserStatusSocket(userId, status);
      if (updatedStatus) {
        io.to(userId).emit('status_update', updatedStatus);
      } else {
        console.error(`[Socket] User not found for ID: ${userId}`);
      }
    } catch (error) {
      console.error('[Socket] Error updating status:', error);
    }
  });

  socket.on('disconnect', async () => {
    logger.debug('[Socket] Client disconnected', {
      socketId: socket.id,
      userId: socket.userId || socket.handshake.auth.userId,
      reason,
      timestamp: new Date().toISOString(),
    });
    console.log('[Socket] Client disconnected');
    for (const [userId, activeSocket] of activeConnections.entries()) {
      if (activeSocket === socket) {
        try {
          await User.findByIdAndUpdate(userId, { $set: { status: 'offline' } });
          io.to(userId).emit('status_update', 'offline');
        } catch (error) {
          console.error('[Socket] Error updating user status on disconnect:', error);
        }
        activeConnections.delete(userId);
        break;
      }
    }
  });

  socket.on('booking_update', (data) => {
    io.emit('booking_update', data);
  });
});

const handleSocketConnection = (socket) => {
  logger.info('[Socket:Server] New client connected:', {
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  socket.on('login', async (data) => {
    const userId = data.userId;
    logger.info('[Socket:Server] User logged in:', {
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    socket.join(userId);
    activeConnections.set(userId, socket);

    try {
      // Update user's online status
      await User.findByIdAndUpdate(userId, { 
        $set: { 
          status: 'online',
          lastSocketConnection: new Date()
        } 
      });

      // Deliver pending notifications
      const pendingUserNotifications = pendingNotifications.get(userId) || [];
      if (pendingUserNotifications.length > 0) {
        logger.info('[Socket:Server] Delivering pending notifications:', {
          userId,
          count: pendingUserNotifications.length,
          timestamp: new Date().toISOString()
        });

        for (const notification of pendingUserNotifications) {
          socket.emit('notification', notification);
          
          // Update delivery log
          notificationDeliveryLog.set(notification._id, {
            deliveredAt: new Date(),
            recipient: userId,
            status: 'delivered',
            attempt: (notificationDeliveryLog.get(notification._id)?.attempt || 0) + 1
          });
        }
        
        pendingNotifications.delete(userId);
      }
    } catch (error) {
      logger.error('[Socket:Server] Error during user login:', {
        error: error.message,
        userId,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('notification_delivered', async (data) => {
    const { notificationId, recipientId, timestamp } = data;
    
    logger.info('[Socket:Server] Notification delivery acknowledged:', {
      notificationId,
      recipientId,
      timestamp,
      socketId: socket.id
    });

    try {
      await Notification.findByIdAndUpdate(notificationId, {
        $set: {
          'delivery.statuses.$[elem].status': 'delivered',
          'delivery.statuses.$[elem].timestamp': new Date(timestamp)
        }
      }, {
        arrayFilters: [{ 'elem.channel': 'in_app' }],
        new: true
      });

      logger.info('[Socket:Server] Updated notification delivery status:', {
        notificationId,
        status: 'delivered',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('[Socket:Server] Error updating notification status:', {
        error: error.message,
        notificationId,
        timestamp: new Date().toISOString()
      });
    }
  });
};

io.on('connection', handleSocketConnection);

io.engine.on('connection_error', (err) => {
  logger.error('[Socket:Server] Connection error:', {
    error: err.message,
    code: err.code,
    context: err.context,
    timestamp: new Date().toISOString()
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Server] Unhandled Rejection:', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    timestamp: new Date().toISOString()
  });
});

// Add error handling for socket server
io.engine.on("connection_error", (err) => {
  logger.error('[Socket:Server] Connection error:', {
    message: err.message,
    context: err.context,
    timestamp: new Date().toISOString()
  });
});

// Add periodic cleanup of delivery logs
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  let cleanupCount = 0;

  for (const [notificationId, log] of notificationDeliveryLog.entries()) {
    if (new Date(log.deliveredAt || log.errorAt || log.queuedAt) < oneHourAgo) {
      notificationDeliveryLog.delete(notificationId);
      cleanupCount++;
    }
  }

  if (cleanupCount > 0) {
    logger.info('[Socket:Server] Cleaned up delivery logs:', {
      count: cleanupCount,
      timestamp: new Date().toISOString()
    });
  }
}, 60 * 60 * 1000); // Run every hour

app.set('io', io);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => 
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    );

    const reminderService = new ReminderService(io);
    reminderService.start();

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log('Address in use, retrying...');
        setTimeout(() => {
          server.close();
          server.listen(0);
        }, 1000);
      }
    });

    server.on('listening', () => {
      const addr = server.address();
      console.log(`Server is now running on port ${addr.port}`);
    });

  } catch (error) {
    console.error('Failed to connect to the database. Server not started.', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };