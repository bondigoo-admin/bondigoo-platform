const getLocalizedResponse = (req, data) => {
  const language = req.language;
  
  // Assuming data is an object with language keys
  if (data[language]) {
    return data[language];
  }
  
  // Fallback to English if the requested language is not available
  return data.en || data;
};

module.exports = getLocalizedResponse;