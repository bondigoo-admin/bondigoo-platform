const emailService = require('../../utils/emailService');
const { logger } = require('../../utils/logger');
const { i18next } = require('../../config/i18n');

const emailProcessor = async (job) => {
  const { notificationType, recipientEmail, language, templateData, mailjetTemplateId } = job.data;
  const logContext = {
    jobId: job.id,
    jobName: job.name,
    notificationType,
    recipientEmail,
    language
  };

  console.log(`[EmailProcessor] START: Processing job.`, logContext);

  try {
    if (!i18next.isInitialized) {
      logger.warn('[EmailProcessor] i18next not initialized, this might happen on worker cold start. Relying on server init.');
    }
    const t = await i18next.changeLanguage(language);

    const i18nKeyPrefix = `${notificationType}.email`;
    console.log(`[EmailProcessor] Translating content with prefix: notifications:${i18nKeyPrefix}`, logContext);
    
    const subject = t(`notifications:${i18nKeyPrefix}.subject`, templateData);
    const headline = t(`notifications:${i18nKeyPrefix}.headline`, templateData);
    const main_body_text = t(`notifications:${i18nKeyPrefix}.main_body_text`, templateData);
    const button_text = t(`notifications:${i18nKeyPrefix}.button_text`, templateData);
    
    const variables = {
      ...templateData,
      headline,
      main_body_text,
      button_text,
    };
    
    console.log(`[EmailProcessor] Content translated. Preparing to call email service.`, { ...logContext, subject });
    
    await emailService.sendMailjetTemplate({
      mailjetTemplateId,
      recipientEmail,
      subject,
      variables
    });

    console.log(`[EmailProcessor] SUCCESS: Job completed.`, logContext);
  } catch (error) {
    logger.error(`[EmailProcessor] FAILURE: Job failed.`, {
      ...logContext,
      errorMessage: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = emailProcessor;