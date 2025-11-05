/**
 * Recursively transforms 'id' keys to '_id' in an object or array
 * @param {Object|Array} data - The data to transform
 * @return {Object|Array} The transformed data
 */
function transformIdToUnderscoreId(data) {
  if (Array.isArray(data)) {
    return data.map(item => transformIdToUnderscoreId(item));
  }

  if (data !== null && typeof data === 'object') {
    return Object.keys(data).reduce((acc, key) => {
      let value = data[key];
      // Skip if key is already '_id' to prevent nesting
      if (key === '_id') {
        acc[key] = value;
      } else if (key === 'id' && typeof value === 'string') {
        acc['_id'] = value;
      } else {
        acc[key] = transformIdToUnderscoreId(value);
      }
      return acc;
    }, {});
  }

  return data;
}

module.exports = { transformIdToUnderscoreId };