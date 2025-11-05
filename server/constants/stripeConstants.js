exports.STRIPE_ACCOUNT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  RESTRICTED: 'restricted',
  DISABLED: 'disabled'
};

exports.STRIPE_CAPABILITY_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending'
};

exports.STRIPE_PAYOUT_INTERVAL = {
  MANUAL: 'manual',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
};

exports.STRIPE_VERIFICATION_STATUS = {
  NEW: 'new',
  VALIDATED: 'validated',
  VERIFIED: 'verified',
  VERIFICATION_FAILED: 'verification_failed'
};

exports.STRIPE_DEFAULT_MCC = '8299'; // Educational Services