const moderationService = require('../moderationService');

module.exports = async (job) => {
    return moderationService.resolveFlag(job.data);
};