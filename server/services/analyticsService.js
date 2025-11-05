// server/services/analyticsService.js
const Redis = require('ioredis');
const Session = require('../models/Session');
const { logger } = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6380,
});

class AnalyticsService {
  async trackLiveSessionFunnel(sessionId, status, metadata = {}) {
    const key = `livesession:${sessionId}:funnel`;
    const event = {
      status,
      timestamp: new Date(),
      ...metadata,
    };
    await redis.lpush(key, JSON.stringify(event));
    await redis.expire(key, 7 * 24 * 60 * 60); // 7-day TTL for funnel data
    logger.info('[AnalyticsService] Live session funnel event tracked', { sessionId, status });
  }
  async trackJoin(sessionId, userId, joinTime) {
    const key = `session:${sessionId}:analytics`;
    const session = await Session.findOne({ bookingId: sessionId });
    if (!session) {
      logger.error('[analyticsService.trackJoin] Session not found', { sessionId });
      throw new Error('Session not found');
    }

    const analytics = JSON.parse(await redis.get(key) || '{}');
    analytics.joins = analytics.joins || {};
    analytics.joins[userId] = joinTime;
    await redis.set(key, JSON.stringify(analytics), 'EX', 24 * 60 * 60); // 24-hour TTL
    logger.info('[analyticsService.trackJoin] Participant join tracked', { sessionId, userId, joinTime });
  }

  async trackEngagement(sessionId, userId, action) {
    const key = `session:${sessionId}:analytics`;
    const analytics = JSON.parse(await redis.get(key) || '{}');
    analytics.engagement = analytics.engagement || {};
    analytics.engagement[userId] = analytics.engagement[userId] || { actions: [] };
    analytics.engagement[userId].actions.push({ action, timestamp: new Date() });
    await redis.set(key, JSON.stringify(analytics), 'EX', 24 * 60 * 60);
    logger.info('[analyticsService.trackEngagement] Engagement tracked', { sessionId, userId, action });
  }

  async trackToolUsage(sessionId, tool) {
    const key = `session:${sessionId}:analytics`;
    const analytics = JSON.parse(await redis.get(key) || '{}');
    analytics.toolUsage = analytics.toolUsage || {};
    analytics.toolUsage[tool] = (analytics.toolUsage[tool] || 0) + 1;
    await redis.set(key, JSON.stringify(analytics), 'EX', 24 * 60 * 60);
    logger.info('[analyticsService.trackToolUsage] Tool usage tracked', { sessionId, tool });
  }

  async trackBreakoutRoom(sessionId, roomId, participants, startTime) {
    const key = `session:${sessionId}:analytics`;
    const analytics = JSON.parse(await redis.get(key) || '{}');
    analytics.breakoutRooms = analytics.breakoutRooms || [];
    analytics.breakoutRooms.push({ roomId, participants, startTime, endTime: null });
    await redis.set(key, JSON.stringify(analytics), 'EX', 24 * 60 * 60);
    logger.info('[analyticsService.trackBreakoutRoom] Breakout room tracked', { sessionId, roomId, participantCount: participants.length });
  }

  async endBreakoutRoom(sessionId, roomId, endTime) {
    const key = `session:${sessionId}:analytics`;
    const analytics = JSON.parse(await redis.get(key) || '{}');
    const room = analytics.breakoutRooms?.find((r) => r.roomId === roomId);
    if (!room) {
      logger.warn('[analyticsService.endBreakoutRoom] Breakout room not found', { sessionId, roomId });
      return;
    }
    room.endTime = endTime;
    await redis.set(key, JSON.stringify(analytics), 'EX', 24 * 60 * 60);
    logger.info('[analyticsService.endBreakoutRoom] Breakout room ended', { sessionId, roomId, endTime });
  }

  async getSessionAnalytics(sessionId) {
    const key = `session:${sessionId}:analytics`;
    const session = await Session.findOne({ bookingId: sessionId }).populate('participants.userId', 'name');
    if (!session) {
      logger.error('[analyticsService.getSessionAnalytics] Session not found', { sessionId });
      throw new Error('Session not found');
    }

    const analytics = JSON.parse(await redis.get(key) || '{}');
    const startTime = session.startedAt || new Date();
    const duration = session.endedAt
      ? (new Date(session.endedAt) - new Date(startTime)) / 60000
      : (Date.now() - new Date(startTime)) / 60000;

    const lateArrivals = Object.entries(analytics.joins || {})
      .filter(([_, joinTime]) => new Date(joinTime) - new Date(startTime) > 300000) // 5 minutes late
      .map(([userId, joinTime]) => ({
        user: session.participants.find((p) => p.userId.toString() === userId)?.userId.name || 'Unknown',
        joinTime,
      }));

    const engagement = {
      active: Object.keys(analytics.engagement || {}).filter(
        (userId) => analytics.engagement[userId].actions.length > 0
      ).length,
      passive:
        session.participants.length -
        Object.keys(analytics.engagement || {}).filter(
          (userId) => analytics.engagement[userId].actions.length > 0
        ).length,
    };

    const toolUsage = Object.entries(analytics.toolUsage || {}).map(([tool, count]) => ({
      name: tool,
      count,
    }));

    const breakoutRooms = (analytics.breakoutRooms || []).map((room) => {
      const totalTime = room.endTime
        ? (new Date(room.endTime) - new Date(room.startTime)) / 60000
        : 0;
      return { ...room, totalTime };
    });

    const feedback = session.feedback || [];

    const result = {
      duration: Math.round(duration),
      lateArrivals,
      engagement,
      toolUsage,
      breakoutRooms,
      feedback,
    };

    logger.info('[analyticsService.getSessionAnalytics] Analytics retrieved', {
      sessionId,
      duration: result.duration,
      lateArrivalsCount: result.lateArrivals.length,
      engagementActive: result.engagement.active,
      toolUsageCount: result.toolUsage.length,
      breakoutRoomsCount: result.breakoutRooms.length,
      feedbackCount: result.feedback.length,
    });

    return result;
  }
}

module.exports = new AnalyticsService();