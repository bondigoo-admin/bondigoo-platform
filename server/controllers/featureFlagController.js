const FeatureFlag = require('../models/FeatureFlag');
const AuditLog = require('../models/AuditLog');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');

exports.getFeatureFlags = async (req, res) => {    
    try {
        const flags = await FeatureFlag.find({}).populate('lastModifiedBy', 'firstName lastName').sort({ key: 1 });
        res.json(flags);
    } catch (error) {
        logger.error('Error fetching feature flags:', error);
        res.status(500).json({ message: 'Error fetching feature flags' });
    }
};

exports.createFeatureFlag = async (req, res) => {
    const { key, description, isActive, rolloutPercentage, targetedUsers, targetedRoles, targetedCountries } = req.body;
    const adminUserId = req.user.id;
    
    try {
        const existingFlag = await FeatureFlag.findOne({ key });
        if (existingFlag) {
            return res.status(400).json({ message: 'A feature flag with this key already exists.' });
        }

        const newFlag = new FeatureFlag({
            key,
            description,
            isActive,
            rolloutPercentage,
            targetedUsers,
            targetedRoles,
            targetedCountries,
            lastModifiedBy: adminUserId
        });

        await newFlag.save();

        await new AuditLog({
            adminUserId,
            action: 'create_feature_flag',
            targetEntity: 'FeatureFlag',
            targetEntityId: newFlag._id,
            metadata: { createdData: newFlag.toObject() }
        }).save();
        
        const populatedFlag = await FeatureFlag.findById(newFlag._id).populate('lastModifiedBy', 'firstName lastName');

        res.status(201).json(populatedFlag);
    } catch (error) {
        logger.error('Error creating feature flag:', error);
        res.status(500).json({ message: 'Error creating feature flag' });
    }
};

exports.updateFeatureFlag = async (req, res) => {
    const { flagId } = req.params;
    const adminUserId = req.user.id;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(flagId)) {
        return res.status(400).json({ message: 'Invalid feature flag ID.' });
    }

    try {
        const flag = await FeatureFlag.findById(flagId);
        if (!flag) {
            return res.status(404).json({ message: 'Feature flag not found.' });
        }
        
        const originalFlag = flag.toObject();

        Object.assign(flag, updateData);
        flag.lastModifiedBy = adminUserId;
        await flag.save();
        
        const populatedFlag = await FeatureFlag.findById(flag._id).populate('lastModifiedBy', 'firstName lastName');

        await new AuditLog({
            adminUserId,
            action: 'update_feature_flag',
            targetEntity: 'FeatureFlag',
            targetEntityId: flag._id,
            metadata: { before: originalFlag, after: populatedFlag.toObject() }
        }).save();

        res.json(populatedFlag);
    } catch (error) {
        logger.error(`Error updating feature flag ${flagId}:`, error);
        res.status(500).json({ message: 'Error updating feature flag' });
    }
};

exports.deleteFeatureFlag = async (req, res) => {
    const { flagId } = req.params;
    const adminUserId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(flagId)) {
        return res.status(400).json({ message: 'Invalid feature flag ID.' });
    }

    try {
        const flag = await FeatureFlag.findByIdAndDelete(flagId);

        if (!flag) {
            return res.status(404).json({ message: 'Feature flag not found.' });
        }

        await new AuditLog({
            adminUserId,
            action: 'delete_feature_flag',
            targetEntity: 'FeatureFlag',
            targetEntityId: flag._id,
            metadata: { deletedData: flag.toObject() }
        }).save();

        res.json({ message: 'Feature flag deleted successfully.' });
    } catch (error) {
        logger.error(`Error deleting feature flag ${flagId}:`, error);
        res.status(500).json({ message: 'Error deleting feature flag' });
    }
};