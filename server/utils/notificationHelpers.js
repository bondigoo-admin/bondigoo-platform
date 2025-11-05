const NotificationCategories = {
  BOOKING: 'booking',
  SESSION: 'session',
  PAYMENT: 'payment',
  CONNECTION: 'connection',
  ACHIEVEMENT: 'achievement',
  RESOURCE: 'resource',
  MESSAGE: 'message',
  SYSTEM: 'system',
  PROFILE: 'profile',
  REVIEW: 'review'
};

const NotificationChannels = {
  IN_APP: 'in_app',
  EMAIL: 'email',
  PUSH: 'push'
};

const NotificationTypes = {
  // Booking related
  BOOKING_REQUEST: 'booking_request',
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_DECLINED: 'booking_declined',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_CANCELLED_BY_YOU: 'booking_cancelled_by_you',
  CLIENT_CANCELLED_BOOKING: 'client_cancelled_booking', 
  BOOKING_CANCELLED_BY_COACH: 'booking_cancelled_by_coach', 
  BOOKING_RESCHEDULED: 'booking_rescheduled',
  BOOKING_REMINDER: 'booking_reminder',
  BOOKING_CONFIRMED_WITH_PAYMENT: 'booking_confirmed_with_payment',
  COACH_BOOKING_REQUEST: 'coach_booking_request',
  BOOKING_CONFIRMED_BY_CLIENT: 'booking_confirmed_by_client',
  BOOKING_DECLINED_BY_CLIENT: 'booking_declined_by_client',
  NEW_WEBINAR_ATTENDEE: 'new_webinar_attendee', 
  WEBINAR_BOOKING_FAILED_FULL: 'webinar_booking_failed_full', 
  WEBINAR_REGISTRATION_CONFIRMED_CLIENT: 'webinar_registration_confirmed_client',
  WEBINAR_NEW_ATTENDEE_COACH: 'webinar_new_attendee_coach',
  WEBINAR_CANCELLED_BY_COACH_ATTENDEE: 'webinar_cancelled_by_coach_attendee',
  WEBINAR_UPDATED_BY_COACH_ATTENDEE: 'webinar_updated_by_coach_attendee',
  WEBINAR_RESCHEDULED_ACTION_REQUIRED: 'webinar_rescheduled_action_required', 
  YOUR_WEBINAR_RESCHEDULE_CONFIRMED: 'your_webinar_reschedule_confirmed', 
  WEBINAR_ATTENDANCE_RECONFIRMED: 'webinar_attendance_reconfirmed', 
  WEBINAR_CANCELLATION_DUE_TO_RESCHEDULE_CONFIRMED: 'webinar_cancellation_due_to_reschedule_confirmed', 
  WEBINAR_REGISTRATION_CANCELLED_BY_YOU: 'webinar_registration_cancelled_by_you',
  WEBINAR_ATTENDEE_CANCELLED: 'webinar_attendee_cancelled',
  YOUR_BOOKING_CANCELLATION_CONFIRMED: 'your_booking_cancellation_confirmed',

  RESCHEDULE_CONFIRMED_AUTO_CLIENT: 'reschedule_confirmed_auto_client',
  RESCHEDULE_CONFIRMED_AUTO_COACH: 'reschedule_confirmed_auto_coach',  
  RESCHEDULE_REQUEST_SENT_TO_COACH: 'reschedule_request_sent_to_coach', 
  CLIENT_REQUESTED_RESCHEDULE: 'client_requested_reschedule',      
  RESCHEDULE_APPROVED_BY_COACH: 'reschedule_approved_by_coach',     
  RESCHEDULE_CONFIRMED_NOTIFICATION: 'reschedule_confirmed_notification', 
  RESCHEDULE_DECLINED_BY_COACH: 'reschedule_declined_by_coach',   
  RESCHEDULE_REQUEST_DECLINED_CONFIRMATION: 'reschedule_request_declined_confirmation', 
  COACH_PROPOSED_NEW_RESCHEDULE_TIME: 'coach_proposed_new_reschedule_time', 
  COACH_COUNTER_PROPOSAL_SENT_TO_CLIENT: 'coach_counter_proposal_sent_to_client',
  RESCHEDULE_APPROVED_BY_CLIENT_CLIENT_CONFIRM: 'reschedule_approved_by_client_client_confirm',
  RESCHEDULE_APPROVED_BY_CLIENT_COACH_NOTIF: 'reschedule_approved_by_client_coach_notif',
  RESCHEDULE_DECLINED_BY_CLIENT_CLIENT_CONFIRM: 'reschedule_declined_by_client_client_confirm',
  RESCHEDULE_DECLINED_BY_CLIENT_COACH_NOTIF: 'reschedule_declined_by_client_coach_notif',
  CLIENT_ACCEPTED_COACH_COUNTER_PROPOSAL: 'client_accepted_coach_counter_proposal',
  CLIENT_DECLINED_COACH_COUNTER_PROPOSAL: 'client_declined_coach_counter_proposal',
  COACH_COUNTER_PROPOSED_RESCHEDULE_REQUEST: 'coach_counter_proposed_reschedule_request',
  
  // Session related
  SESSION_STARTING: 'session_starting',
  SESSION_STARTING_SOON: 'session_starting_soon',
  SESSION_COMPLETED: 'session_completed',
  SESSION_FEEDBACK_REQUIRED: 'session_feedback_required',
  RECORDING_AVAILABLE: 'RECORDING_AVAILABLE',
  RESOURCE_SHARED: 'RESOURCE_SHARED',
  SESSION_ENDED: 'session_ended',
  OVERTIME_PROMPT: 'overtime_prompt',
  OVERTIME_DECLINED: 'overtime_declined',
  SESSION_TERMINATED: 'session_terminated',
  SESSION_CONTINUED: 'session_continued',

  // Program and Comment related
  PROGRAM_COMMENT_POSTED: 'program_comment_posted',
  PROGRAM_COMMENT_REPLY: 'program_comment_reply',
  PROGRAM_PURCHASE_CONFIRMED: 'program_purchase_confirmed',
  PROGRAM_SALE_COACH: 'program_sale_coach',
  NEW_PROGRAM_REVIEW: 'new_program_review',
  PROGRAM_ASSIGNMENT_SUBMITTED: 'program_assignment_submitted',
  PROGRAM_COMPLETED: 'program_completed',
  
  // Payment related
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REFUNDED: 'payment_refunded',
  REFUND_PROCESSED: 'refund_processed',
  REFUND_FAILED: 'refund_failed_notification',
  REFUND_REQUESTED_FOR_COACH: 'refund_request_for_coach',
  REFUND_REQUEST_ESCALATED: 'refund_request_escalated',
  REFUND_REQUEST_CLIENT_ESCALATED: 'refund_request_client_escalated',
  REFUND_PROCESSED_COACH: 'refund_processed_coach',
  REFUND_PROCESSED_CLIENT: 'refund_processed_client',
  REFUND_REQUEST_ESCALATED_ADMIN: 'refund_request_escalated_admin',
  ADMIN_REFUND_PROCESSING_ERROR: 'admin_refund_processing_error',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_REMINDER: 'payment_reminder',
  PAYMENT_MADE_BY_USER: 'payment_made_by_user',
  IN_SESSION_PAYMENT_FAILED: 'in_session_payment_failed',
  PAYOUT_ON_HOLD: 'payout_on_hold',
  PAYOUT_RELEASED: 'payout_released',

  OVERTIME_PAYMENT_CAPTURED: 'overtime_payment_captured', 
  OVERTIME_PAYMENT_RELEASED: 'overtime_payment_released', 
  OVERTIME_PAYMENT_COLLECTED: 'overtime_payment_collected', 
  OVERTIME_PAYMENT_CAPTURE_FAILED: 'overtime_payment_capture_failed',

  REVIEW_PROMPT_COACH: 'review_prompt_coach',
  REVIEW_PROMPT_CLIENT: 'review_prompt_client',
  USER_ACCOUNT_WARNING: 'user_account_warning',
  REPORT_ACTIONED: 'report_actioned',
  ADMIN_BOOKING_OVERRIDE_PROCESSED: 'admin_booking_override_processed',
  NEW_EARNING_COACH: 'new_earning_coach',
  LIVE_SESSION_RECEIPT_CLIENT: 'live_session_receipt_client',
  LIVE_SESSION_EARNINGS_COACH: 'live_session_earnings_coach',

  USER_CONTENT_HIDDEN: 'user_content_hidden',
  ACCOUNT_SUSPENDED: 'user_account_suspended',
  REPORT_DISMISSED: 'report_dismissed',

  COACH_VERIFICATION_APPROVED: 'coach_verification_approved',
  COACH_VERIFICATION_REJECTED: 'coach_verification_rejected',
  VERIFICATION_EXPIRING_SOON: 'verification_expiring_soon'
};

const NotificationPriorities = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

const NotificationStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  TRASH: 'trash',
  DELETED: 'deleted',
  ACTIONED: "actioned"
};

const NotificationMetadata = {
  [NotificationTypes.BOOKING_REQUEST]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['accept', 'decline', 'suggest']
  },
  [NotificationTypes.BOOKING_CONFIRMED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['view', 'reschedule', 'cancel']
  },
  [NotificationTypes.BOOKING_CONFIRMED_WITH_PAYMENT]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view', 'reschedule', 'cancel']
  },
    [NotificationTypes.COACH_BOOKING_REQUEST]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['accept_by_client', 'decline_by_client']
  },
  [NotificationTypes.BOOKING_CONFIRMED_BY_CLIENT]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view']
  },
  [NotificationTypes.BOOKING_DECLINED_BY_CLIENT]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view']
  },
  [NotificationTypes.NEW_WEBINAR_ATTENDEE]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_webinar_details']
  },
   [NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_webinar_details', 'add_to_calendar']
  },
  [NotificationTypes.WEBINAR_NEW_ATTENDEE_COACH]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_webinar_details', 'view_attendee_list']
  },
  [NotificationTypes.WEBINAR_BOOKING_FAILED_FULL]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false, // User doesn't need to act, it's informational
    validStatuses: ['active', 'archived'],
    validActions: ['view_available_webinars']
  },
  [NotificationTypes.PAYMENT_RECEIVED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view']
  },
  [NotificationTypes.PAYMENT_FAILED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['retry', 'view']
  },
  [NotificationTypes.PAYMENT_REMINDER]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['pay_now']
  },
  [NotificationTypes.REVIEW_PROMPT_COACH]: {
    category: NotificationCategories.REVIEW,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'actioned', 'archived'],
    validActions: ['review'],
  },
  [NotificationTypes.REVIEW_PROMPT_CLIENT]: {
    category: NotificationCategories.REVIEW,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'actioned', 'archived'], 
    validActions: ['review'],
  },
  [NotificationTypes.OVERTIME_PROMPT]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'actioned'],
    validActions: ['end_session', 'free_overtime', 'paid_overtime', 'confirm_payment', 'decline_overtime']
  },
  [NotificationTypes.IN_SESSION_PAYMENT_FAILED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'actioned'],
    validActions: ['continue_session', 'terminate_session']
  },
  [NotificationTypes.PAYOUT_ON_HOLD]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_earnings_summary']
  },
  [NotificationTypes.PAYOUT_RELEASED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_earnings_summary']
  },
  [NotificationTypes.OVERTIME_DECLINED]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view']
  },
  [NotificationTypes.SESSION_TERMINATED]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view']
  },
  [NotificationTypes.SESSION_CONTINUED]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view']
  },
  [NotificationTypes.SESSION_ENDED]: { 
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_session', 'rate_session'] 
  },

   [NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_CLIENT]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view', 'cancel']
  },
  [NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_COACH]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view']
  },
[NotificationTypes.RESCHEDULE_REQUEST_SENT_TO_COACH]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },

  [NotificationTypes.REFUND_REQUESTED_FOR_COACH]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active'],
    validActions: ['review_refund_request']
  },
  [NotificationTypes.REFUND_REQUEST_ESCALATED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_dispute_details']
  },
  [NotificationTypes.REFUND_PROCESSED_COACH]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_transaction_history']
  },
   [NotificationTypes.REFUND_PROCESSED_CLIENT]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },

  [NotificationTypes.REFUND_REQUEST_ESCALATED_ADMIN]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active'],
    validActions: ['review_dispute']
  },

  [NotificationTypes.OVERTIME_PAYMENT_CAPTURED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_receipt', 'view_booking'] 
  },
  [NotificationTypes.OVERTIME_PAYMENT_RELEASED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.LOW, 
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking']
  },
  [NotificationTypes.OVERTIME_PAYMENT_COLLECTED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_payout', 'view_booking'] 
  },
  [NotificationTypes.OVERTIME_PAYMENT_CAPTURE_FAILED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.HIGH, 
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL], 
    requiresAction: true, 
    validStatuses: ['active'],
    validActions: ['retry_capture', 'contact_support', 'view_booking'] 
  },
    [NotificationTypes.BOOKING_CANCELLED_BY_YOU]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_receipt']
  },
  [NotificationTypes.CLIENT_CANCELLED_BOOKING]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.BOOKING_CANCELLED_BY_COACH]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.YOUR_BOOKING_CANCELLATION_CONFIRMED]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.LOW,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: []
  },
  [NotificationTypes.REFUND_PROCESSED]: { 
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.EMAIL], 
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_transaction_history']
  },
  [NotificationTypes.REFUND_FAILED_NOTIFICATION]: { 
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.EMAIL],
    requiresAction: true, 
    validStatuses: ['active'],
    validActions: ['contact_support']
  },
  [NotificationTypes.ADMIN_REFUND_PROCESSING_ERROR]: { 
    category: NotificationCategories.SYSTEM, 
    priority: NotificationPriorities.HIGH,
    defaultChannels: [], 
    requiresAction: true,
    validStatuses: ['active'],
    validActions: ['investigate_refund']
  },
  [NotificationTypes.WEBINAR_RESCHEDULED_ACTION_REQUIRED]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active'],
    validActions: ['confirm_rescheduled_webinar', 'decline_rescheduled_webinar']
  },  
  [NotificationTypes.CLIENT_REQUESTED_RESCHEDULE]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['approve_reschedule_request', 'decline_reschedule_request', 'counter_propose_reschedule_request', 'view_booking_details']
  },

  [NotificationTypes.RESCHEDULE_APPROVED_BY_COACH]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.RESCHEDULE_CONFIRMED_NOTIFICATION]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.LOW,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.RESCHEDULE_DECLINED_BY_COACH]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details', 'contact_coach']
  },
  [NotificationTypes.RESCHEDULE_REQUEST_DECLINED_CONFIRMATION]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.LOW,
    defaultChannels: [NotificationChannels.IN_APP], 
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: []
  },
  [NotificationTypes.COACH_PROPOSED_NEW_RESCHEDULE_TIME]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active'],
    validActions: ['client_accept_coach_proposal', 'client_decline_coach_proposal', 'client_propose_new_time_to_coach', 'view_booking_details']
  },
  [NotificationTypes.COACH_COUNTER_PROPOSAL_SENT_TO_CLIENT]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true, // Client needs to act
    validStatuses: ['active'],
    validActions: ['client_accept_coach_proposal', 'client_decline_coach_proposal', 'client_propose_new_time_to_coach', 'view_booking_details']
  },
  [NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_CLIENT_CONFIRM]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_COACH_NOTIF]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_CLIENT_CONFIRM]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details', 'contact_coach']
  },
  [NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_COACH_NOTIF]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
   [NotificationTypes.CLIENT_ACCEPTED_COACH_COUNTER_PROPOSAL]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.CLIENT_DECLINED_COACH_COUNTER_PROPOSAL]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details', 'contact_coach']
  },
  [NotificationTypes.COACH_COUNTER_PROPOSED_RESCHEDULE_REQUEST]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true, 
    validStatuses: ['active', 'archived'],
    validActions: ['approve_reschedule_request', 'decline_reschedule_request', 'counter_propose_reschedule_request', 'view_booking_details']
  },

  [NotificationTypes.WEBINAR_ATTENDANCE_RECONFIRMED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_webinar_details']
  },
  [NotificationTypes.WEBINAR_CANCELLATION_DUE_TO_RESCHEDULE_CONFIRMED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_transaction_history']
  },
  [NotificationTypes.YOUR_WEBINAR_RESCHEDULE_CONFIRMED]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.LOW,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_webinar_details']
  },

  [NotificationTypes.ADMIN_BOOKING_OVERRIDE_PROCESSED]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL], 
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details']
  },
  [NotificationTypes.USER_ACCOUNT_WARNING]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['contact_support']
  },
  [NotificationTypes.REPORT_ACTIONED]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.LOW,
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: []
  },
   [NotificationTypes.LIVE_SESSION_RECEIPT_CLIENT]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_receipt', 'book_again']
  },
  [NotificationTypes.LIVE_SESSION_EARNINGS_COACH]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_earnings_summary']
  },
  [NotificationTypes.YOUR_BOOKING_CANCELLATION_CONFIRMED]: { 
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.LOW, // Or MEDIUM, depending on desired visibility
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_booking_details'] // Action to view the now-cancelled booking
  },  
   [NotificationTypes.WEBINAR_REGISTRATION_CANCELLED_BY_YOU]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_receipt'] // Or other relevant actions
  },
  [NotificationTypes.WEBINAR_ATTENDEE_CANCELLED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_webinar_details'] // Or 'view_attendee_list'
  },
    [NotificationTypes.PROGRAM_COMMENT_POSTED]: {
    category: NotificationCategories.RESOURCE,
    priority: NotificationPriorities.LOW,
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_lesson']
  },
 [NotificationTypes.PROGRAM_COMMENT_REPLY]: {
    category: NotificationCategories.MESSAGE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'actioned', 'archived'],
    validActions: ['view_comment', 'reply']
  },
  [NotificationTypes.PROGRAM_PURCHASE_CONFIRMED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_program']
  },
  [NotificationTypes.PROGRAM_SALE_COACH]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_program_details']
  },
    [NotificationTypes.NEW_PROGRAM_REVIEW]: {
    category: NotificationCategories.REVIEW,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_review', 'view_program']
  },
  [NotificationTypes.PROGRAM_ASSIGNMENT_SUBMITTED]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: true,
    validStatuses: ['active', 'actioned', 'archived'],
    validActions: ['review_assignment']
  },
  [NotificationTypes.PROGRAM_COMPLETED]: {
    category: NotificationCategories.ACHIEVEMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_program', 'leave_review']
  },
   [NotificationTypes.NEW_EARNING_COACH]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_earnings_summary']
  },
  [NotificationTypes.USER_CONTENT_HIDDEN]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['contact_support']
  },
  [NotificationTypes.ACCOUNT_SUSPENDED]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['contact_support']
  },
   [NotificationTypes.REPORT_DISMISSED]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.LOW,
    defaultChannels: [NotificationChannels.IN_APP],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: []
  },
  [NotificationTypes.COACH_VERIFICATION_APPROVED]: {
    category: NotificationCategories.PROFILE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: false,
    validStatuses: ['active', 'archived'],
    validActions: ['view_profile', 'update_availability']
  },
  [NotificationTypes.COACH_VERIFICATION_REJECTED]: {
    category: NotificationCategories.PROFILE,
    priority: NotificationPriorities.HIGH,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['resubmit_verification', 'contact_support']
  },
  [NotificationTypes.VERIFICATION_EXPIRING_SOON]: {
    category: NotificationCategories.PROFILE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
    requiresAction: true,
    validStatuses: ['active', 'archived'],
    validActions: ['renew_verification']
  }
};

const validateNotificationData = (data) => {
  console.log('[NotificationHelpers] Validating notification data:', {
    type: data.type,
    recipient: data.recipient,
    hasContent: !!data.content
  });

  const metadata = NotificationMetadata[data.type];
  if (!metadata) {
    console.warn('[NotificationHelpers] Unknown notification type:', data.type);
    return {
      isValid: false,
      errors: ['Invalid notification type']
    };
  }

  const errors = [];
  
  if (!data.recipient) errors.push('Recipient is required');
  if (!data.content?.title) errors.push('Notification title is required');
  if (!data.content?.message) errors.push('Notification message is required');
  
  return {
    isValid: errors.length === 0,
    errors,
    metadata
  };
};

const getNotificationConfig = (type) => {
  console.log('[NotificationHelpers] Getting config for type:', type);
  const config = NotificationMetadata[type] || {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.LOW,
    defaultChannels: ['in_app'],
    ttl: 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  
  console.log('[NotificationHelpers] Resolved config:', {
    type,
    category: config.category,
    priority: config.priority,
    channels: config.defaultChannels
  });
  
  return config;
};

module.exports = {
  NotificationCategories,
  NotificationTypes,
  NotificationPriorities,
  NotificationStatus,
  NotificationMetadata,
  getNotificationConfig,
  NotificationChannels,
  validateNotificationData
};