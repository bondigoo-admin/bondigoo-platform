const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const discountController = require('../controllers/discountController');
const { auth, isCoach } = require('../middleware/auth');

// Middleware to handle validation results
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

/**
 * @route   POST /api/discounts
 * @desc    Create a new discount code
 * @access  Private (Coach)
 */
router.post('/',
    [
        auth,
        isCoach,
        check('code', 'Code is required if not an automatic discount.').if(check('isAutomatic').not().toBoolean()).not().isEmpty().trim().isLength({ min: 3, max: 20 }).isAlphanumeric(),
        check('isAutomatic', 'isAutomatic must be a boolean.').isBoolean(),
        check('type', 'Discount type must be "percent" or "fixed".').isIn(['percent', 'fixed']),
        check('value', 'Value must be a positive number.').isFloat({ min: 0.01 }),
        check('appliesTo.scope', 'A valid scope is required.').isIn(['platform_wide', 'all_programs', 'specific_programs', 'all_sessions', 'specific_session_types']),
        check('appliesTo.entityIds', 'entityIds must be an array of MongoIDs.').if(check('appliesTo.scope').isIn(['specific_programs', 'specific_session_types'])).isArray(),
        check('appliesTo.entityIds.*', 'Invalid entity ID.').if(check('appliesTo.scope').isIn(['specific_programs', 'specific_session_types'])).isMongoId(),
        check('minimumPurchaseAmount', 'Minimum purchase amount must be a non-negative number.').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        check('eligibility.type', 'Eligibility type is required.').isIn(['all', 'segment', 'individual']),
        check('eligibility.entityIds', 'Eligibility entityIds must be an array of MongoIDs.').if(check('eligibility.type').isIn(['segment', 'individual'])).isArray(),
        check('eligibility.entityIds.*', 'Invalid eligibility entity ID.').if(check('eligibility.type').isIn(['segment', 'individual'])).isMongoId(),
        check('startDate', 'Invalid start date.').optional({ checkFalsy: true }).isISO8601().toDate(),
        check('expiryDate', 'Invalid expiry date.').optional({ checkFalsy: true }).isISO8601().toDate(),
        check('usageLimit', 'Usage limit must be a positive integer.').optional({ checkFalsy: true }).isInt({ min: 1 }),
        check('limitToOnePerCustomer', 'limitToOnePerCustomer must be a boolean.').isBoolean(),
    ],
    validate,
    discountController.createDiscount
);

/**
 * @route   GET /api/discounts/coach
 * @desc    Get all discounts for the logged-in coach
 * @access  Private (Coach)
 */
router.get('/coach', auth, isCoach, discountController.getCoachDiscounts);

router.get('/active-automatic', 
    [
        auth,
        check('entityType', 'Entity type is required.').isIn(['session', 'program']),
        check('entityId', 'Entity ID is required.').isMongoId(),
        check('coachId', 'Coach ID is required.').isMongoId(),
        check('currentPrice', 'Current price is required.').isFloat({ min: 0 })
    ],
    validate,
    discountController.getActiveAutomaticDiscount
);

/**
 * @route   PUT /api/discounts/:id
 * @desc    Update a discount
 * @access  Private (Coach)
 */
router.put('/:id',
    [
        auth,
        isCoach,
        // Optional validation for update fields
        check('type', 'Discount type must be "percent" or "fixed"').optional().isIn(['percent', 'fixed']),
        check('value', 'Value must be a positive number').optional().isFloat({ min: 0.01 }),
        check('appliesTo.scope', 'A valid scope is required').optional().isIn(['platform_wide', 'all_programs', 'specific_programs', 'all_sessions', 'specific_session_types']),
    ],
    validate,
    discountController.updateDiscount
);

/**
 * @route   DELETE /api/discounts/:id
 * @desc    Delete a discount
 * @access  Private (Coach)
 */
router.delete('/:id', auth, isCoach, discountController.deleteDiscount);


/**
 * @route   POST /api/discounts/validate-price
 * @desc    Validate a discount code against a price.
 * @access  Public (Auth is optional)
 */
router.post('/validate-price',
    [
        auth, // Auth is optional and handled by the middleware if a token is present
        check('entityType', 'Entity type is required').isIn(['session', 'program']),
        check('entityId', 'Entity ID is required').isMongoId(),
        check('coachId', 'Coach ID is required').isMongoId(),
        check('code', 'Discount code is required').not().isEmpty().trim(),
        check('currentPrice', 'Current price must be a valid non-negative number').isFloat({ min: 0 }),
    ],
    validate,
    discountController.validateDiscountForPrice
);

module.exports = router;