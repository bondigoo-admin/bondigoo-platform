const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const validateComment = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content cannot be empty.')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Comment must be between 1 and 2000 characters.')
    .escape(), // Sanitize content to prevent XSS
  
  body('parentComment')
    .optional({ checkFalsy: true }) // Allows null or undefined
    .isMongoId()
    .withMessage('Invalid parent comment ID.'),
];

const validateCoachTaxInfo = [
  body('isVatRegistered')
    .isBoolean()
    .withMessage('VAT registration status must be a boolean.'),
  body('vatNumber')
    .optional({ checkFalsy: true })
    .isString().withMessage('VAT number must be a string.')
    .trim()
    .escape(),
  body('businessAddress')
    .isObject()
    .withMessage('Business address must be an object.'),
  body('businessAddress.line1')
    .optional({ checkFalsy: true })
    .isString().withMessage('Address line 1 must be a string.')
    .trim()
    .escape(),
  body('businessAddress.line2')
    .optional({ checkFalsy: true })
    .isString().withMessage('Address line 2 must be a string.')
    .trim()
    .escape(),
  body('businessAddress.city')
    .optional({ checkFalsy: true })
    .isString().withMessage('City must be a string.')
    .trim()
    .escape(),
  body('businessAddress.postalCode')
    .optional({ checkFalsy: true })
    .isString().withMessage('Postal code must be a string.')
    .trim()
    .escape(),
  body('businessAddress.country')
    .notEmpty().withMessage('Country is required.')
    .isISO31661Alpha2().withMessage('Country must be a valid ISO 3166-1 alpha-2 code.')
    .toUpperCase(),
];


module.exports = {
  handleValidationErrors,
  validateComment,
  validateCoachTaxInfo
};