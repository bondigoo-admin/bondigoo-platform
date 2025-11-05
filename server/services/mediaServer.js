const mediasoup = require('mediasoup');
const Redis = require('ioredis');
const { logger } = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6380,
});

class MediaServer {
  constructor() {
    this.workers = [];
    this.routers = new Map();
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.workerLoad = new Map();
    this.initializeWorkers();
  }

  async initializeWorkers() {
    const numWorkers = Math.max(2, Math.floor(require('os').cpus().length * 0.9)); // Use 90% of cores
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 10000,
        rtcMaxPort: 59999,
        appData: { workerId: i },
      });
      worker.on('died', async () => {
        logger.error('[MediaServer] Worker died', { workerPid: worker.pid });
        this.workers = this.workers.filter(w => w.pid !== worker.pid);
        await this.initializeWorkers(); // Replace dead worker
      });
      this.workers.push(worker);
      this.workerLoad.set(worker.pid, 0);
      logger.info('[MediaServer] Worker initialized', { workerId: i, pid: worker.pid });
    }
    logger.info('[MediaServer] Workers initialized', { count: numWorkers });
  }

  async getLeastLoadedWorker() {
    const worker = this.workers.reduce((min, curr) => 
      this.workerLoad.get(curr.pid) < this.workerLoad.get(min.pid) ? curr : min
    );
    this.workerLoad.set(worker.pid, this.workerLoad.get(worker.pid) + 1);
    logger.debug('[MediaServer] Selected least loaded worker', { pid: worker.pid, load: this.workerLoad.get(worker.pid) });
    return worker;
  }

  async getRouter(sessionId) {
    if (this.routers.has(sessionId)) return this.routers.get(sessionId);

    const worker = await this.getLeastLoadedWorker();
    const router = await worker.createRouter({
      mediaCodecs: [
        { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2, parameters: { 'sprop-stereo': 1 } },
        { kind: 'video', mimeType: 'video/VP8', clockRate: 90000, rtcpFeedback: [{ type: 'nack' }, { type: 'nack', parameter: 'pli' }] },
        { kind: 'video', mimeType: 'video/H264', clockRate: 90000, parameters: { 'level-asymmetry-allowed': 1, 'profile-level-id': '42e01f' } },
      ],
      appData: { sessionId },
    });
    this.routers.set(sessionId, router);
    await redis.set(`router:${sessionId}`, JSON.stringify({ workerPid: worker.pid }), 'EX', 24 * 60 * 60); // 24-hour TTL
    logger.info('[MediaServer] Router created', { sessionId, workerPid: worker.pid });
    return router;
  }

  async createTransport(sessionId, socketId) {
    const router = await this.getRouter(sessionId);
    const isLowPowerDevice = HARDWARE_CAPABILITIES.isLowPower; // Access global hardware capabilities
    const initialBitrate = isLowPowerDevice ? 1000000 : 2000000; // 1 Mbps for low-power, 2 Mbps otherwise
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.PUBLIC_IP || '172.17.153.237' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: initialBitrate,
      iceServers: [
        {
          urls: `turn:${process.env.TURN_HOST || '172.17.153.237'}:${process.env.TURN_PORT || '3474'}`,
          username: process.env.TURN_USER || 'testuser',
          credential: process.env.TURN_PASS || 'testpass',
        },
      ],
      appData: { socketId },
    });
    this.transports.set(`${sessionId}:${socketId}`, transport);
    logger.info('[MediaServer] Transport created', { sessionId, socketId, transportId: transport.id, initialBitrate });
    return transport;
  }

  async produce(sessionId, socketId, transportId, kind, rtpParameters) {
    const transport = this.transports.get(`${sessionId}:${socketId}`);
    if (!transport || transport.id !== transportId) {
      logger.error('[MediaServer] Invalid transport for produce', { sessionId, socketId, transportId });
      throw new Error('Invalid transport');
    }
    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { sessionId, socketId },
    });
    this.producers.set(`${sessionId}:${socketId}:${kind}`, producer);
    logger.info('[MediaServer] Producer created', { sessionId, socketId, kind, producerId: producer.id });
    return producer;
  }

  async consume(sessionId, producerSocketId, consumerSocketId, producerId) {
    const router = await this.getRouter(sessionId);
    const consumerTransport = this.transports.get(`${sessionId}:${consumerSocketId}`);
    if (!consumerTransport) {
      logger.error('[MediaServer] Consumer transport not found', { sessionId, consumerSocketId });
      throw new Error('Consumer transport not found');
    }
    const producer = this.producers.get(`${sessionId}:${producerSocketId}:video`) || 
                    this.producers.get(`${sessionId}:${producerSocketId}:audio`);
    if (!producer || producer.id !== producerId) {
      logger.error('[MediaServer] Invalid producer for consume', { sessionId, producerId });
      throw new Error('Invalid producer');
    }

    const consumer = await consumerTransport.consume({
      producerId,
      rtpCapabilities: router.rtpCapabilities,
      paused: false, // Start unpaused for better UX
      appData: { sessionId, consumerSocketId },
    });
    this.consumers.set(`${sessionId}:${consumerSocketId}:${consumer.id}`, consumer);
    logger.info('[MediaServer] Consumer created', { sessionId, consumerSocketId, producerId, consumerId: consumer.id });
    return consumer;
  }

  async closeSession(sessionId) {
    this.transports.forEach((transport, key) => {
      if (key.startsWith(`${sessionId}:`)) {
        transport.close();
        this.transports.delete(key);
      }
    });
    this.producers.forEach((producer, key) => {
      if (key.startsWith(`${sessionId}:`)) {
        producer.close();
        this.producers.delete(key);
      }
    });
    this.consumers.forEach((consumer, key) => {
      if (key.startsWith(`${sessionId}:`)) {
        consumer.close();
        this.consumers.delete(key);
      }
    });
    const router = this.routers.get(sessionId);
    if (router) {
      const workerPid = router.worker.pid;
      router.close();
      this.routers.delete(sessionId);
      this.workerLoad.set(workerPid, Math.max(0, this.workerLoad.get(workerPid) - 1));
    }
    await redis.del(`router:${sessionId}`);
    logger.info('[MediaServer] Session closed', { sessionId });
  }
}

module.exports = new MediaServer();