const environment = process.env.NODE_ENV || 'development';

const schedules = {
  defaults: {
    payoutProcessor: '0 0 * * *',
    disputeEscalation: '0 0 * * *',
    attachmentCleanup: '0 0 * * *',
    trustScoreCalculation: '0 0 * * *',
    verificationExpiry: '0 0 * * *',
  },

  production: {
    payoutProcessor: null,
  },

  staging: {},

  development: {},
};

const getSchedule = (jobName) => {
  const envSchedules = schedules[environment] || {};
  
  if (Object.prototype.hasOwnProperty.call(envSchedules, jobName)) {
    return envSchedules[jobName];
  }
  
  return schedules.defaults[jobName];
};

module.exports = { getSchedule };