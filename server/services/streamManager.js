const { logger } = require('../utils/logger');
const MediaServer = require('./mediaServer');
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6380 });

class StreamManager {
  constructor() {
    this.statsInterval = new Map(); // Per-session intervals
    this.sessionStats = new Map();
  }

  async startMonitoring(sessionId) {
    if (this.statsInterval.has(sessionId)) return;

    const interval = setInterval(async () => {
      const participantCount = await redis.scard(`session:${sessionId}:participants`) || 1;
      const producers = Array.from(MediaServer.producers.entries()).filter(([key]) => key.startsWith(`${sessionId}:`));
      if (producers.length === 0) {
        this.stopMonitoring(sessionId);
        return;
      }

      for (const [producerKey, producer] of producers) {
        try {
          const stats = await producer.getStats();
          const networkStats = this.processStats(stats);
          this.sessionStats.set(producerKey, networkStats);
          const newBitrate = this.adjustBitrate(producer, networkStats, participantCount);
          if (newBitrate) {
            require('../socketConfig').io.of('/video').to(`session:${sessionId}`).emit('bitrate-update', {
              producerId: producer.id,
              bitrate: newBitrate,
            });
            logger.info('[StreamManager] Bitrate updated', { sessionId, producerId: producer.id, bitrate: newBitrate });
          }
        } catch (error) {
          logger.warn('[StreamManager] Stats fetch error', { sessionId, producerKey, error: error.message });
        }
      }
    }, 3000); // Check every 3 seconds

    this.statsInterval.set(sessionId, interval);
    logger.info('[StreamManager] Monitoring started', { sessionId });
  }

  processStats(stats) {
    let rtt = 0;
    let packetLoss = 0;
    stats.forEach(stat => {
      if (stat.type === 'outbound-rtp') {
        rtt = stat.roundTripTime || 0;
        packetLoss = (stat.packetsLost || 0) / (stat.packetsSent || 1);
      }
    });
    return { rtt, packetLoss };
  }

  adjustBitrate(producer, { rtt, packetLoss }, participantCount) {
    const baseBitrate = 2000000; // 2 Mbps for 720p
    const minBitrate = 150000; // 150 kbps minimum
    let targetBitrate = baseBitrate / Math.max(1, Math.ceil(participantCount / 3)); // Scale down every 3 participants

    if (rtt > 150 || packetLoss > 0.05) {
      targetBitrate = Math.max(minBitrate, targetBitrate * 0.7); // Reduce by 30%
    } else if (rtt < 80 && packetLoss < 0.01) {
      targetBitrate = Math.min(baseBitrate, targetBitrate * 1.3); // Increase by 30%
    }

    const currentBitrate = producer.rtpParameters.encodings[0]?.maxBitrate || baseBitrate;
    if (Math.abs(targetBitrate - currentBitrate) > 100000) { // Significant change threshold
      producer.rtpParameters.encodings[0] = producer.rtpParameters.encodings[0] || {};
      producer.rtpParameters.encodings[0].maxBitrate = targetBitrate;
      producer.setRtpEncodingParameters({ maxBitrate: targetBitrate });
      return targetBitrate;
    }
    return null;
  }

  stopMonitoring(sessionId) {
    const interval = this.statsInterval.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.statsInterval.delete(sessionId);
      this.sessionStats.delete(sessionId);
      logger.info('[StreamManager] Monitoring stopped', { sessionId });
    }
  }
}

module.exports = new StreamManager();