
export const CONNECT_STATES = {
  NOT_STARTED: 'not_started',
  CREATING: 'creating',
  PENDING: 'pending',
  INCOMPLETE: 'incomplete',
  ACTIVE: 'active',
  ERROR: 'error'
};

export const CONNECT_REQUIREMENTS = {
  BUSINESS_PROFILE: 'business_profile',
  BANK_ACCOUNT: 'bank_account',
  VERIFICATION: 'verification',
  TAX_INFO: 'tax_info'
};

export const CONNECT_URLS = {
  SUCCESS: `${window.location.origin}/settings/connect/complete`,
  REFRESH: `${window.location.origin}/settings/connect/refresh`,
  RETURN: `${window.location.origin}/settings`
};

export const CONNECT_ERROR_TYPES = {
  CREATION_FAILED: 'creation_failed',
  FETCH_FAILED: 'fetch_failed',
  REQUIREMENTS_FAILED: 'requirements_failed',
  UPDATE_FAILED: 'update_failed'
};

export const CONNECT_MESSAGES = {
  [CONNECT_STATES.NOT_STARTED]: 'payments:connect.status.not_started',
  [CONNECT_STATES.CREATING]: 'payments:connect.status.creating',
  [CONNECT_STATES.PENDING]: 'payments:connect.status.pending',
  [CONNECT_STATES.INCOMPLETE]: 'payments:connect.status.incomplete',
  [CONNECT_STATES.ACTIVE]: 'payments:connect.status.active',
  [CONNECT_STATES.ERROR]: 'payments:connect.status.error'
};