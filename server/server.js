const express = require('express');
const fs = require('fs').promises;
const cookieParser = require('cookie-parser');
const { initializeI18next, i18next } = require('./config/i18n');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const connectDB = require('./dbConnect');
const userRoutes = require('./routes/userRoutes');
const coachRoutes = require('./routes/coachRoutes');
const statusRoutes = require('./routes/statusRoutes');
const adminRoutes = require('./routes/adminRoutes');
const config = require('./config');
const languageMiddleware = require('./middleware/languageMiddleware');
const fileUpload = require('express-fileupload');
const connectionRoutes = require('./routes/connectionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const liveSessionRoutes = require('./routes/liveSessionRoutes');
const morgan = require('morgan');
const userController = require('./controllers/userController');
const paymentController = require('./controllers/paymentController');
const User = require('./models/User');
const ReminderService = require('./services/reminderService');
const { configureSocket, SOCKET_EVENTS } = require('./socketConfig');
const { logger, requestLogger } = require('./utils/logger');
const winston = require('winston');
const paymentRoutes = require('./routes/paymentRoutes');
const stripeService = require('./services/stripeService');
const priceRoutes = require('./routes/priceRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const recordingRoutes = require('./routes/recordingRoutes');
const redis = require('./redisClient');
const path = require('path');
const { cleanupUnusedResources } = require('./cleanupResources');
const reviewRoutes = require('./routes/ReviewRoutes');
const messageRoutes = require('./routes/messageRoutes');
const programRoutes = require('./routes/programRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const { apiLimiter } = require('./middleware/rateLimiter');
const earningsRoutes = require('./routes/earningsRoutes');
const { auth, isCoach } = require('./middleware/auth');
const earningsController = require('./controllers/earningsController');
const searchRoutes = require('./routes/searchRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const cron = require('node-cron');
const { processPendingPayouts } = require('./services/payoutProcessor');
const { escalateStaleDisputes } = require('./jobs/disputeEscalationJob');
const { runAttachmentCleanup } = require('./jobs/attachmentCleanupJob');
const calculateTrustScores = require('./scripts/calculateTrustScores');
const { scheduleVerificationExpiryReminders } = require('./jobs/verificationExpiryReminderJob');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

app.use((req, res, next) => {
  if (req.originalUrl.includes('/api/payments/webhook')) {
   console.log('[[[SERVER-ENTRY-POINT]]] Webhook request received at server entry.', {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      ip: req.ip
    });
  }
  next();
});

const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5000', 'http://localhost:5001', 'http://localhost:5002'];

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
  exposedHeaders: ['Content-Disposition'],
};

const { io, activeConnections, connectionMonitor } = configureSocket(server);
app.set('io', io);
app.set('redis', redis);

const { initializeSocketService } = require('./services/socketService');
initializeSocketService(io);
//console.log('[Server] SocketNotificationService initialized with io');

const reminderService = new ReminderService(io);

const pendingNotifications = new Map();

// Notification delivery tracking
const notificationDeliveryLog = new Map();

console.log('[Server] Redis initialized', { host: redis.options.host, port: redis.options.port });

app.use(requestLogger);

app.use('/api/earnings/temp', express.static(path.join(__dirname, 'temp_pdfs')));

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.post('/api/payments/webhook', express.raw({type: 'application/json'}), paymentController.webhookHandler);

app.use((req, res, next) => {
  /*console.log('[Server] Incoming request', {
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString(),
  });*/
  next();
});



// Parse JSON and URL-encoded bodies
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
    /*logger.debug('[server] Request body received:', {
      path: req.path,
      method: req.method,
      contentLength: buf.length,
      contentType: req.headers['content-type']
    });*/
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/tfjs', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  next();
}, express.static(path.join(__dirname, '../client/public/tfjs')));

app.use('/', (req, res, next) => {
  if (req.path.endsWith('.worker.js')) {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
}, express.static(path.join(__dirname, '../client/public')));

// Debug middleware for request body logging
app.use((req, res, next) => {
  if (req.body && Object.keys(req.body).length) {
    /*logger.debug('[server] Parsed request body:', {
      path: req.path,
      method: req.method,
      bodyKeys: Object.keys(req.body),
      bodyPreview: JSON.stringify(req.body).substring(0, 200) + '...'
    });*/
  }
  next();
});

app.use(cors(corsOptions));

app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  const devRoutes = require('./routes/devRoutes');
  app.use('/api/dev', devRoutes);
  //console.log('✅ --- DEV-ONLY routes enabled at /api/dev ---');
}

app.use('/api/', apiLimiter);

// Rest of your existing server.js code remains exactly the same...
app.use(morgan('dev', {
  skip: function (req, res) {
    // Skip logging for payment status, health check, and messages endpoints
    return req.originalUrl.includes('/api/payments/status/') ||
           req.originalUrl === '/health' ||
           req.originalUrl === '/api/status' ||
           (req.method === 'GET' && req.originalUrl.includes('/api/messages/conversations/'));
  }
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/recordings/') || req.path.startsWith('/api/sessions/') || req.path.startsWith('/api/upload')) {
    next();
  } else {
    fileUpload({
      useTempFiles: true,
      tempFileDir: '/tmp/',
      limits: { fileSize: 100 * 1024 * 1024 },
    })(req, res, next);
  }
});


app.use('/api/prices', priceRoutes);
app.use('/api/sessions', (req, res, next) => {
  //console.log('Request headers:', req.headers);
  //console.log('Request body (before multer):', req.body);
  next();
});
app.use('/api/sessions', sessionRoutes);
(async () => {
  const uploadDir = path.join(__dirname, 'uploads');
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    //console.log('[server] Upload directory ensured', { path: uploadDir });
  } catch (err) {
    //logger.error('[server] Failed to create upload directory', { error: err.message });
  }
})();
app.use('/api/recordings', recordingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/livesessions', liveSessionRoutes);

app.post('/api/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const event = await stripeService.handleWebhookEvent(req.body, req.headers['stripe-signature']);
      res.json({ received: true });
    } catch (err) {
      logger.error('[Server] Stripe webhook error:', {
        error: err.message,
        type: err.type,
        timestamp: new Date().toISOString()
      });
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

app.options('/api/users/background', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000'); // Match your frontend
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', 86400); // Cache preflight for 24 hours
  res.sendStatus(204);
});

app.use('/api/payments', paymentRoutes.router);

//console.log('Connection routes added to server');

// Your existing routes and middleware remain unchanged...
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is connected' });
});

app.get('/api', (req, res) => {
  res.json({ message: 'API is running' });
});

app.use((err, req, res, next) => {
  // Handle Stripe webhook signature verification errors
  if (err.type === 'StripeSignatureVerificationError') {
    logger.error('[Server] Stripe webhook signature verification failed:', {
      error: err.message,
      type: err.type,
      timestamp: new Date().toISOString()
    });
    return res.status(400).json({
      success: false,
      message: 'Invalid webhook signature'
    });
  }

  // Handle Stripe API errors
  if (err.type === 'StripeAPIError') {
    logger.error('[Server] Stripe API error:', {
      error: err.message,
      type: err.type,
      code: err.code,
      timestamp: new Date().toISOString()
    });
    return res.status(502).json({
      success: false,
      message: 'Payment service error'
    });
  }

  // Handle Stripe card errors
  if (err.type === 'StripeCardError') {
    logger.error('[Server] Stripe card error:', {
      error: err.message,
      type: err.type,
      code: err.code,
      timestamp: new Date().toISOString()
    });
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  // Your existing general error handling
  logger.error('Unexpected error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.user?._id,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

app.use(languageMiddleware);

app.get('/', (req, res) => {
  res.send(`API is running (Language: ${req.language})`);
});

app.use('/api/announcements', announcementRoutes);
app.use('/api/search', searchRoutes);

//console.log('[server.js] Mounting /api/users routes from userRoutes.js');
app.use('/api/users', userRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/messages', messageRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/discounts', require('./routes/discountRoutes'));
app.use('/api/status', statusRoutes);
//console.log('[DEBUG] server.js: Mounting /api/invoices...');
app.use('/api/invoices',  require('./routes/invoiceRoutes'));
//console.log('[DEBUG] server.js: Finished mounting /api/invoices.');
app.use('/api/earnings', earningsRoutes);
app.use('/api/leads', require('./routes/leadRoutes'));

app.use((req, res, next) => {
  req.io = io;
  req.activeConnections = activeConnections;
  req.connectionMonitor = connectionMonitor;
  req.notificationDeliveryLog = notificationDeliveryLog;
  req.pendingNotifications = pendingNotifications;
  next();
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await initializeI18next();
    //console.log(`[i18next] Service initialized. Loaded languages: ${i18next.languages.join(', ')}. Default namespace: ${i18next.options.defaultNS}`);

    await connectDB();
    server.listen(PORT, () => 
     console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    );

    console.log('[Cron] Scheduling payout processor job to run every 30 minutes.');
    cron.schedule('*/1 * * * *', () => {
     console.log('[Cron] Triggering processPendingPayouts job.');
      processPendingPayouts();
    });

     console.log('[Cron] Scheduling dispute escalation job.');
    cron.schedule('0 * * * *', () => { // Run at the top of every hour
     console.log('[Cron] Triggering escalateStaleDisputes job.');
      escalateStaleDisputes();
    });

    console.log('[Cron] Scheduling daily attachment cleanup job.');
    cron.schedule('0 3 * * *', () => { // Run at 3 AM every day
     console.log('[Cron] Triggering runAttachmentCleanup job.');
      runAttachmentCleanup();
    });

    console.log('[Cron] Scheduling daily trust score calculation job.');
    cron.schedule('0 4 * * *', () => { // Run at 4 AM every day
     console.log('[Cron] Triggering calculateTrustScores script.');
      calculateTrustScores();
    });

    console.log('[Cron] Scheduling daily verification expiry reminder job.');
      scheduleVerificationExpiryReminders();

    // Start cleanup job
    cleanupUnusedResources(); // Run once on startup for immediate cleanup
   console.log('[Server] Resource cleanup job scheduled');

 // Start broadcasting system health updates
    setInterval(async () => {
      try {
        const systemHealthService = require('./services/systemHealthService');
        const redisClient = app.get('redis');
        const healthStatus = await systemHealthService.getHealth(redisClient);
        
        // Fetch all connected sockets
        const sockets = await io.fetchSockets();
        for (const socket of sockets) {
            // The userId is attached to the socket during authentication middleware
            if (socket.userId) {
                const user = await User.findById(socket.userId).select('role').lean();
                if (user && user.role === 'admin') {
                    // Emit directly to the admin's user-specific room
                    io.to(socket.userId).emit('system_health_update', healthStatus);
                }
            }
        }
      } catch (error) {
        logger.error('Failed to broadcast system health update', { error: error.message });
      }
    }, 60000); // Broadcast every 60 seconds. TO BE DECREASED IN LIVE

   console.log('[Server] ReminderService initialized and running');
     const jobQueueService = require('./services/jobQueueService');
jobQueueService.initialize(io);
   console.log('[Server] BullMQ Workers have been initialized.');

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        logger.error('Address in use, retrying...', { port: PORT });
        setTimeout(() => {
          server.close();
          server.listen(0);
        }, 1000);
      }
    });

    server.on('listening', () => {
      const addr = server.address();
     console.log('Server started', { 
        port: addr.port,
        environment: process.env.NODE_ENV
      });
    });

  } catch (error) {
    logger.error('Failed to connect to the database. Server not started:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };