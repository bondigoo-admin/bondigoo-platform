// New file: utils/settingsHelper.js
const { logger } = require('./logger');

const mergeSettings = (existingSettings = {}, newSettings = {}, path = '') => {
  try {
    logger.debug('[settingsHelper] Merging settings:', {
      path,
      existingKeys: Object.keys(existingSettings),
      newKeys: Object.keys(newSettings)
    });

    // Deep clone existing settings to avoid mutations
    const merged = JSON.parse(JSON.stringify(existingSettings));

    Object.keys(newSettings).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (newSettings[key] && typeof newSettings[key] === 'object' && !Array.isArray(newSettings[key])) {
        // Recursively merge objects
        merged[key] = mergeSettings(
          merged[key] || {}, 
          newSettings[key],
          currentPath
        );
      } else {
        // Direct assignment for non-objects or arrays
        merged[key] = newSettings[key];
      }
    });

    logger.debug('[settingsHelper] Settings merged successfully:', {
      path,
      resultKeys: Object.keys(merged)
    });

    return merged;
  } catch (error) {
    logger.error('[settingsHelper] Error merging settings:', {
      error: error.message,
      path,
      stack: error.stack
    });
    throw error;
  }
};

module.exports = {
  mergeSettings
};