const config = {
  priceCalculation: {
    ttl: 5 * 60, // 5 minutes
    checkperiod: 60, // Check for expired keys every minute
  },
  keys: {
    priceCalculation: (coachId, sessionTypeId, start, end) => 
      `price:${coachId}:${sessionTypeId}:${start}:${end}`
  },
  options: {
    useClones: false, // For better performance with JSON data
    deleteOnExpire: true,
    enableLegacyCallbacks: false,
  }
};

module.exports = config;