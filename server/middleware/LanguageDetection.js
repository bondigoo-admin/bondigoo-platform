const supportedLanguages = ['en', 'de', 'fr'];

const languageMiddleware = (req, res, next) => {
  const lang = req.query.lang || req.headers['accept-language'];
  
  if (lang) {
    const language = lang.split(',')[0].trim().split('-')[0].toLowerCase();
    if (supportedLanguages.includes(language)) {
      req.language = language;
    } else {
      req.language = 'en'; // Default to English if not supported
    }
  } else {
    req.language = 'en'; // Default to English if no language is specified
  }

  next();
};

module.exports = languageMiddleware;