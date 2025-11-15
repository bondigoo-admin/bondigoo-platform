const Mailjet = require('node-mailjet');
const { logger } = require('./logger');

let mailjet;
const isMailjetConfigured = process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY;

if (isMailjetConfigured) {
  mailjet = Mailjet.apiConnect(
    process.env.MAILJET_API_KEY,
    process.env.MAILJET_SECRET_KEY
  );
  console.log('[EmailService] Mailjet client initialized successfully.');
} else {
  logger.warn('[EmailService] Mailjet API keys not found. Email service is in mocked mode. Emails will be logged but not sent.');
}

exports.sendMailjetTemplate = async ({ mailjetTemplateId, recipientEmail, subject, variables }) => {
  let finalRecipientEmail = recipientEmail;
  const logContext = {
    mailjetTemplateId,
    originalRecipient: recipientEmail,
    subject
  };

  if (process.env.NODE_ENV !== 'production' && process.env.DEVELOPMENT_EMAIL_RECIPIENT) {
    logger.warn(`[EmailService] DEV_MODE: Rerouting email to ${process.env.DEVELOPMENT_EMAIL_RECIPIENT}.`, logContext);
    finalRecipientEmail = process.env.DEVELOPMENT_EMAIL_RECIPIENT;
  }
  logContext.finalRecipient = finalRecipientEmail;

  if (!isMailjetConfigured) {
    logger.error(`[EmailService] MOCKED (FAILURE): Mailjet not configured. Email NOT sent.`, logContext);
    return Promise.resolve();
  }

  const mailjetPayload = {
    Messages: [
      {
        From: {
          Email: process.env.MAILJET_SENDER_EMAIL,
          Name: process.env.MAILJET_SENDER_NAME,
        },
        To: [
          {
            Email: finalRecipientEmail,
            Name: variables.firstName || '',
          },
        ],
        TemplateID: parseInt(mailjetTemplateId, 10),
        TemplateLanguage: true,
        Subject: subject,
        Variables: variables,
      },
    ],
  };

  console.log(`[EmailService] Sending final payload to Mailjet API...`, { ...logContext, templateVariables: Object.keys(variables) });

  try {
    const request = mailjet
      .post('send', { version: 'v3.1' })
      .request(mailjetPayload);

    const result = await request;
    console.log(`[EmailService] SUCCESS: Mailjet API call successful.`, { ...logContext, mailjetStatus: result.body?.Messages[0]?.Status });
    
  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error(`[EmailService] FAILURE: Mailjet API call failed.`, {
      ...logContext,
      statusCode: error.statusCode,
      errorMessage,
    });
    throw error;
  }
};