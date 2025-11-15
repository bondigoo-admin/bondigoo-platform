const NotificationTypes = require('./notificationHelpers').NotificationTypes;

const TEMPLATE_IDS = {
  GENERAL_ACTION: 7493681,
  WELCOME: 7493670
};

const NotificationTemplateMap = {
  // Account Management
  [NotificationTypes.WELCOME]: { id: TEMPLATE_IDS.WELCOME }, // Replace with your actual Mailjet Template ID
  [NotificationTypes.EMAIL_VERIFICATION]: { id: TEMPLATE_IDS.GENERAL_ACTION },
  [NotificationTypes.PASSWORD_RESET]: { id: TEMPLATE_IDS.GENERAL_ACTION },

  // Booking & Session - Client
  [NotificationTypes.BOOKING_CONFIRMED]: { id: 123459, recipientType: 'client' },
  [NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT]: { id: TEMPLATE_IDS.GENERAL_ACTION },
  [NotificationTypes.PAYMENT_REMINDER]: { id: TEMPLATE_IDS.GENERAL_ACTION },
  [NotificationTypes.REVIEW_PROMPT_CLIENT]: { id: TEMPLATE_IDS.GENERAL_ACTION },

  // Booking & Session - Coach
  [NotificationTypes.BOOKING_REQUEST]: { id: TEMPLATE_IDS.GENERAL_ACTION },
  [NotificationTypes.BOOKING_CONFIRMED_COACH_NOTIFICATION]: { id: TEMPLATE_IDS.GENERAL_ACTION }, // A specific template for the coach
  [NotificationTypes.NEW_WEBINAR_ATTENDEE_COACH]: { id: TEMPLATE_IDS.GENERAL_ACTION },
  [NotificationTypes.CLIENT_CANCELLED_BOOKING]: { id: TEMPLATE_IDS.GENERAL_ACTION },
  [NotificationTypes.REVIEW_PROMPT_COACH]: { id: TEMPLATE_IDS.GENERAL_ACTION },

  // Payments
  [NotificationTypes.PAYMENT_RECEIVED]: { id: TEMPLATE_IDS.GENERAL_ACTION, recipientType: 'client' },
  [NotificationTypes.PROGRAM_PURCHASE_CONFIRMED]: { id: TEMPLATE_IDS.GENERAL_ACTION, recipientType: 'client' },
  [NotificationTypes.PAYMENT_MADE_BY_USER]: { id: TEMPLATE_IDS.GENERAL_ACTION, recipientType: 'coach' },
  [NotificationTypes.PROGRAM_SALE_COACH]: { id: TEMPLATE_IDS.GENERAL_ACTION, recipientType: 'coach' },

};

module.exports = { NotificationTemplateMap };