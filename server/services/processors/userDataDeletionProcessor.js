const { logger } = require('../../utils/logger');
const User = require('../../models/User');

module.exports = async (job) => {
    const { userId } = job.data;
    if (!userId) {
        logger.error('[UserDataDeletionProcessor] Job received without a userId.', job.data);
        return;
    }
    const logContext = { job: 'delete-user-data', userId };
    logger.info('Starting permanent deletion process for user.', logContext);
    await User.findByIdAndDelete(userId);
    logger.info('Successfully deleted user document from database.', logContext);
};