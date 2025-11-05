const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * @desc    Get active announcements for the current user or guest.
 * @route   GET /api/announcements/active
 * @access  Public
 */
exports.getActiveAnnouncements = async (req, res) => {
    try {
        const userRole = req.user ? req.user.role : null;
        const userId = req.user ? req.user._id : null;
        const now = new Date();

        console.log(`[ANNOUNCEMENT_CTRL] --- START: getActiveAnnouncements ---`);
        console.log(`[ANNOUNCEMENT_CTRL] Request Details: userRole='${userRole}', userId='${userId}', location='${req.query.location || 'global_banner'}'`);

        // Base query for active, time-valid announcements
        const query = {
            isActive: true,
            displayLocation: req.query.location || 'global_banner',
            $or: [
                { startDate: { $lte: now } },
                { startDate: null },
                { startDate: { $exists: false } }
            ],
            $and: [
                {
                    $or: [
                        { endDate: { $gte: now } },
                        { endDate: null },
                        { endDate: { $exists: false } }
                    ]
                }
            ]
        };
        
        // Build the role targeting part of the query
        const roleQuery = {
            $or: [
                // 1. Announcements with NO roles specified (global for everyone)
                { targetedRoles: { $exists: true, $size: 0 } },
            ]
        };
        
        if (userRole) {
            // 2. If user is logged in, ALSO include announcements targeting their specific role
            roleQuery.$or.push({ targetedRoles: userRole });
            console.log(`[ANNOUNCEMENT_CTRL] User is logged in. Adding role '${userRole}' to query.`);
        } else {
            console.log(`[ANNOUNCEMENT_CTRL] No user role found. Querying for global announcements only.`);
        }
        
        // Combine the role query with the main query
        query.$and.push(roleQuery);

        console.log(`[ANNOUNCEMENT_CTRL] Executing MongoDB Query: ${JSON.stringify(query, null, 2)}`);

        const announcements = await Announcement.find(query).sort({ createdAt: -1 });

        console.log(`[ANNOUNCEMENT_CTRL] Found ${announcements.length} active announcements for role '${userRole || 'guest'}'`);
        console.log(`[ANNOUNCEMENT_CTRL] --- END: getActiveAnnouncements ---`);
        
        res.json(announcements);

    } catch (error) {
        console.error('[ANNOUNCEMENT_CTRL] FATAL Error fetching active announcements:', error);
        res.status(500).json({ message: 'Server error while fetching announcements.' });
    }
};

/**
 * @desc    Track a view for an announcement
 * @route   POST /api/announcements/:id/view
 * @access  Public
 */
exports.trackAnnouncementView = async (req, res) => {
    try {
        await Announcement.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
        res.sendStatus(200);
    } catch (error) {
        // Log silently, as this is not a critical failure for the user
        logger.warn('[AnnouncementCtrl] Failed to track announcement view', { id: req.params.id, error: error.message });
        res.sendStatus(200); // Still return success to not break client flow
    }
};

/**
 * @desc    Track a click for an announcement
 * @route   POST /api/announcements/:id/click
 * @access  Public
 */
exports.trackAnnouncementClick = async (req, res) => {
    try {
        await Announcement.findByIdAndUpdate(req.params.id, { $inc: { clickCount: 1 } });
        res.sendStatus(200);
    } catch (error) {
        logger.warn('[AnnouncementCtrl] Failed to track announcement click', { id: req.params.id, error: error.message });
        res.sendStatus(200);
    }
};

exports.getAnnouncements = async (req, res) => {    
    try {
        const announcements = await Announcement.find({}).sort({ createdAt: -1 });
        res.json(announcements);
    } catch (error) {
        logger.error('Error fetching announcements for admin:', error);
        res.status(500).json({ message: 'Error fetching announcements' });
    }
};

exports.createAnnouncement = async (req, res) => {
    const adminUserId = req.user.id;
    
    try {
        const announcementData = { ...req.body };
        if (announcementData.content) {
            announcementData.content = purify.sanitize(announcementData.content);
        }
        const newAnnouncement = new Announcement(announcementData);
        await newAnnouncement.save();

        await new AuditLog({
            adminUserId,
            action: 'announcement_create',
            metadata: { announcementId: newAnnouncement._id, details: newAnnouncement.toObject() }
        }).save();

        res.status(201).json(newAnnouncement);
    } catch (error) {
        logger.error('Error creating announcement:', error);
        if (error.message.includes('End date cannot be before')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error creating announcement' });
    }
};

exports.updateAnnouncement = async (req, res) => {
    const { id } = req.params;
    const adminUserId = req.user.id;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid announcement ID.' });
    }

    if (updateData.content) {
        updateData.content = purify.sanitize(updateData.content);
    }

    try {
        const announcement = await Announcement.findById(id);
        if (!announcement) {
            return res.status(404).json({ message: 'Announcement not found.' });
        }
        
        Object.assign(announcement, updateData);
        const updatedAnnouncement = await announcement.save();

        await new AuditLog({
            adminUserId,
            action: 'announcement_update',
            metadata: { announcementId: updatedAnnouncement._id, changes: updateData }
        }).save();

        res.json(updatedAnnouncement);
    } catch (error) {
        logger.error(`Error updating announcement ${id}:`, error);
         if (error.message.includes('End date cannot be before')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error updating announcement' });
    }
};

exports.deleteAnnouncement = async (req, res) => {
    const { id } = req.params;
    const adminUserId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid announcement ID.' });
    }

    try {
        const announcement = await Announcement.findByIdAndDelete(id);
        if (!announcement) {
            return res.status(404).json({ message: 'Announcement not found.' });
        }

        await new AuditLog({
            adminUserId,
            action: 'announcement_delete',
            metadata: { announcementId: announcement._id, content: announcement.content }
        }).save();

        res.json({ message: 'Announcement deleted successfully.' });
    } catch (error) {
        logger.error(`Error deleting announcement ${id}:`, error);
        res.status(500).json({ message: 'Error deleting announcement' });
    }
};

exports.trackAnnouncementView = async (req, res) => {
    try {
        await Announcement.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
        res.sendStatus(204);
    } catch (error) {
        logger.error('Error tracking announcement view:', error);
        res.sendStatus(500);
    }
};

exports.trackAnnouncementClick = async (req, res) => {
    try {
        await Announcement.findByIdAndUpdate(req.params.id, { $inc: { clickCount: 1 } });
        res.sendStatus(204);
    } catch (error) {
        logger.error('Error tracking announcement click:', error);
        res.sendStatus(500);
    }
};