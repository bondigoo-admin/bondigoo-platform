const liveSessionManager = require('../liveSessionManager');

module.exports = async (job) => {
  switch (job.name) {
    case 'monitor-session':
      return liveSessionManager.monitorSession(job.data.sessionId);
    case 'force-end-session':
      return liveSessionManager.forceEndSession(job.data.sessionId);
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }
};