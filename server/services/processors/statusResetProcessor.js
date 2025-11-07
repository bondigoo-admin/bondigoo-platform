const liveSessionManager = require('../liveSessionManager');

module.exports = async (job) => {
    const { coachId, expectedStatus } = job.data;
    return liveSessionManager.resetCoachStatus(coachId, expectedStatus);
};