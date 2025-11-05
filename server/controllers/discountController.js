const Discount = require('../models/Discount');
const DiscountUsage = require('../models/DiscountUsage');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const _isDiscountApplicable = async (discount, currentPrice, entityType, entityId, userId) => {
    const now = new Date();
    if (discount.startDate && now < discount.startDate) {
        throw new Error('DISCOUNT_NOT_ACTIVE_YET');
    }
    if (discount.expiryDate && now > discount.expiryDate) {
        throw new Error('DISCOUNT_EXPIRED');
    }
    if (discount.usageLimit && discount.timesUsed >= discount.usageLimit) {
        throw new Error('USAGE_LIMIT_REACHED');
    }
    if (discount.minimumPurchaseAmount && currentPrice < discount.minimumPurchaseAmount) {
        const error = new Error('MINIMUM_PURCHASE_NOT_MET');
        error.details = {
            amount: discount.minimumPurchaseAmount,
            currency: 'CHF'
        };
        throw error;
    }

    if (discount.limitToOnePerCustomer) {
        if (!userId) throw new Error('LOGIN_REQUIRED');
        const usageRecord = await DiscountUsage.findOne({ discount: discount._id, user: userId });
        if (usageRecord) {
            throw new Error('ALREADY_USED');
        }
    }

    if (discount.eligibility.type !== 'all') {
        if (!userId) throw new Error('LOGIN_REQUIRED');
        const isEligible = discount.eligibility.entityIds.some(id => id.equals(userId));
        if (!isEligible) {
            throw new Error('NOT_ELIGIBLE');
        }
    }

    let isApplicableToEntity = false;
    const entityObjectId = new mongoose.Types.ObjectId(entityId);
    switch (discount.appliesTo.scope) {
        case 'platform_wide': isApplicableToEntity = true; break;
        case 'all_programs': isApplicableToEntity = (entityType === 'program'); break;
        case 'specific_programs': isApplicableToEntity = (entityType === 'program' && discount.appliesTo.entityIds.some(id => id.equals(entityObjectId))); break;
        case 'all_sessions': isApplicableToEntity = (entityType === 'session'); break;
        case 'specific_session_types': isApplicableToEntity = (entityType === 'session' && discount.appliesTo.entityIds.some(id => id.equals(entityObjectId))); break;
    }

    if (!isApplicableToEntity) {
        throw new Error('NOT_APPLICABLE_TO_ITEM');
    }

    return true;
};

const _calculateDiscountedPrice = (discount, currentPrice) => {
    let discountAmount = 0;
    if (discount.type === 'percent') {
        discountAmount = currentPrice * (discount.value / 100);
    } else {
        discountAmount = discount.value;
    }
    const finalPrice = Math.max(0, currentPrice - discountAmount);
    const actualAmountDeducted = currentPrice - finalPrice;

    return {
        finalPrice,
        appliedDiscount: {
            _id: discount._id,
            code: discount.code,
            type: discount.type,
            value: discount.value,
            amountDeducted: parseFloat(actualAmountDeducted.toFixed(2))
        }
    };
};

exports.createDiscount = async (req, res) => {
    try {
        const coachId = req.user._id;
        const discountData = req.body;

        if (discountData.isAutomatic && !discountData.code) {
           discountData.code = `AUTO_${uuidv4().split('-')[0].toUpperCase()}`;
        }
        
        const newDiscount = new Discount({
            ...discountData,
            coach: coachId,
        });

        await newDiscount.save();

        logger.info('[discountController.createDiscount] New discount created successfully', { coachId, discountCode: newDiscount.code });
        res.status(201).json(newDiscount);

    } catch (error) {
        if (error.code === 11000) {
            logger.warn('[discountController.createDiscount] Attempt to create duplicate discount code', { coachId: req.user._id, code: req.body.code });
            return res.status(409).json({ message: 'A discount with this code already exists for you.' });
        }
        logger.error('[discountController.createDiscount] Error creating discount', { error: error.message, stack: error.stack, coachId: req.user._id });
        res.status(500).json({ message: 'Server error while creating discount.' });
    }
};

exports.getCoachDiscounts = async (req, res) => {
    try {
        const coachId = req.user._id;
        const discounts = await Discount.find({ coach: coachId }).sort({ createdAt: -1 });
        res.status(200).json(discounts);
    } catch (error) {
        logger.error('[discountController.getCoachDiscounts] Error fetching coach discounts', { error: error.message, stack: error.stack, coachId: req.user._id });
        res.status(500).json({ message: 'Server error while fetching discounts.' });
    }
};

exports.updateDiscount = async (req, res) => {
    try {
        const coachId = req.user._id;
        const { id } = req.params;
        const updates = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid discount ID format.' });
        }

        const discount = await Discount.findById(id);

        if (!discount) {
            return res.status(404).json({ message: 'Discount not found.' });
        }

        if (discount.coach.toString() !== coachId.toString()) {
            return res.status(403).json({ message: 'You are not authorized to update this discount.' });
        }

        delete updates.code;
        delete updates.coach;
        delete updates.timesUsed;
        delete updates.createdAt;
        delete updates.updatedAt;
        delete updates._id;

        Object.assign(discount, updates);
        await discount.save();
        
        logger.info('[discountController.updateDiscount] Discount updated successfully', { coachId, discountId: id });
        res.status(200).json(discount);
    } catch (error) {
        logger.error('[discountController.updateDiscount] Error updating discount', { error: error.message, stack: error.stack, coachId: req.user._id, discountId: req.params.id });
        res.status(500).json({ message: 'Server error while updating discount.' });
    }
};

exports.deleteDiscount = async (req, res) => {
    try {
        const coachId = req.user._id;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid discount ID format.' });
        }

        const discount = await Discount.findOneAndDelete({ _id: id, coach: coachId });

        if (!discount) {
            return res.status(404).json({ message: 'Discount not found or you are not authorized to delete it.' });
        }
        
        await DiscountUsage.deleteMany({ discount: id });

        logger.info('[discountController.deleteDiscount] Discount deleted successfully', { coachId, discountId: id });
        res.status(200).json({ message: 'Discount deleted successfully.' });
    } catch (error) {
        logger.error('[discountController.deleteDiscount] Error deleting discount', { error: error.message, stack: error.stack, coachId: req.user._id, discountId: req.params.id });
        res.status(500).json({ message: 'Server error while deleting discount.' });
    }
};

exports.validateDiscountForPrice = async (req, res) => {
    const { entityType, entityId, code, currentPrice, coachId } = req.body;
    const userId = req.user ? req.user._id : null;

    try {
        const discount = await Discount.findOne({ coach: coachId, code: code.toUpperCase().trim(), isActive: true });

        if (!discount) {
            throw new Error("INVALID_OR_EXPIRED_CODE");
        }
        if (discount.isAutomatic) {
            throw new Error("AUTOMATIC_DISCOUNT");
        }

        await _isDiscountApplicable(discount, currentPrice, entityType, entityId, userId);
        const priceAfterDiscount = _calculateDiscountedPrice(discount, currentPrice);

        res.status(200).json({
            originalPrice: currentPrice,
            finalPrice: priceAfterDiscount.finalPrice,
            discountApplied: priceAfterDiscount.appliedDiscount
        });

    } catch (error) {
        logger.warn('[discountController.validateDiscountForPrice] Discount validation failed', {
            errorCode: error.message,
            details: error.details,
            body: req.body
        });
        res.status(400).json({
            code: error.message, // This is now the error code, e.g., 'DISCOUNT_EXPIRED'
            details: error.details || {}
        });
    }
};

exports.getActiveAutomaticDiscount = async (req, res) => {
    const { entityType, entityId, coachId, currentPrice } = req.query;
    const userId = req.user ? req.user._id : null;

    try {
        const now = new Date();
        const potentialDiscounts = await Discount.find({
            coach: coachId,
            isActive: true,
            isAutomatic: true,
            $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }],
            $or: [{ expiryDate: { $exists: false } }, { expiryDate: { $gte: now } }]
        }).sort({ createdAt: -1 });

        for (const discount of potentialDiscounts) {
            try {
                await _isDiscountApplicable(discount, parseFloat(currentPrice), entityType, entityId, userId);
                const priceAfterDiscount = _calculateDiscountedPrice(discount, parseFloat(currentPrice));
                return res.status(200).json(priceAfterDiscount);
            } catch (validationError) {
                continue;
            }
        }

        res.status(200).json(null);

    } catch (error) {
        logger.error('[discountController.getActiveAutomaticDiscount] Error fetching automatic discount', {
            error: error.message,
            query: req.query
        });
        res.status(500).json({ message: "Server error while checking for automatic discounts." });
    }
};

exports._isDiscountApplicable = _isDiscountApplicable;
exports._calculateDiscountedPrice = _calculateDiscountedPrice;