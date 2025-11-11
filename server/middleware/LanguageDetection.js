const supportedLanguages = ['en', 'de', 'fr', 'it'];

const languageMiddleware = (req, res, next) => {
  let language = 'de'; // Default language

  // 1. Prioritize language from authenticated user's profile
  if (req.user && req.user.preferredLanguage && supportedLanguages.includes(req.user.preferredLanguage)) {
    language = req.user.preferredLanguage;
    req.language = language;
    return next();
  }

  // 2. Fallback to query parameter or headers for anonymous users or users without a preference
  const langHeader = req.query.lang || req.headers['accept-language'];
  if (langHeader) {
    const detectedLang = langHeader.split(',')[0].trim().split('-')[0].toLowerCase();
    if (supportedLanguages.includes(detectedLang)) {
      language = detectedLang;
    }
  }
  
  req.language = language;
  next();
};

module.exports = languageMiddleware;
