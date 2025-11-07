const { logger } = require('../../utils/logger');
const User = require('../../models/User');
const Coach = require('../../models/Coach');
const Program = require('../../models/Program');
const Lesson = require('../../models/Lesson');
const Message = require('../../models/Message');
const assetCleanupService = require('../assetCleanupService');

module.exports = async (job) => {
    if (job.name === 'delete-user-attachments') {
        const { userId } = job.data;
        const logContext = { job: 'accountCleanupProcessor:delete-user-attachments', userId };
        logger.info('Processing job to delete ALL assets for user.', logContext);

        const user = await User.findById(userId).lean();
        if (!user) {
            logger.warn('User not found for cleanup job. Aborting.', logContext);
            return;
        }

        const assetIdsToDelete = { image: new Set(), video: new Set(), raw: new Set() };

        if (user.profilePicture?.publicId) assetIdsToDelete.image.add(user.profilePicture.publicId);
        if (user.backgrounds?.length > 0) {
            user.backgrounds.forEach(bg => bg.publicId && assetIdsToDelete.image.add(bg.publicId));
        }

        if (user.role === 'coach') {
            const coach = await Coach.findOne({ user: userId }).lean();
            if (coach) {
                if (coach.profilePicture?.publicId) assetIdsToDelete.image.add(coach.profilePicture.publicId);
                if (coach.videoIntroduction?.publicId) assetIdsToDelete.video.add(coach.videoIntroduction.publicId);
                if (coach.settings?.insuranceRecognition?.registries?.length > 0) {
                    coach.settings.insuranceRecognition.registries.forEach(reg => {
                        if (reg.verificationDocument?.publicId) assetIdsToDelete.raw.add(reg.verificationDocument.publicId);
                    });
                }
            }

            const programs = await Program.find({ coach: userId }).populate('modules').lean();
            for (const program of programs) {
                if (program.programImages?.length > 0) {
                    program.programImages.forEach(img => img.publicId && assetIdsToDelete.image.add(img.publicId));
                }
                if (program.trailerVideo?.publicId) assetIdsToDelete.video.add(program.trailerVideo.publicId);

                const lessonIds = program.modules.flatMap(m => m.lessons);
                const lessons = await Lesson.find({ _id: { $in: lessonIds } }).select('content').lean();
                for (const lesson of lessons) {
                    lesson.content?.files?.forEach(file => {
                        if (file.publicId) {
                            file.resourceType === 'video' ? assetIdsToDelete.video.add(file.publicId) : assetIdsToDelete.image.add(file.publicId);
                        }
                    });
                    lesson.content?.presentation?.slides?.forEach(slide => {
                        if (slide.imagePublicId) assetIdsToDelete.image.add(slide.imagePublicId);
                        if (slide.audioPublicId) assetIdsToDelete.video.add(slide.audioPublicId);
                    });
                }
            }
        }

        let lastMsgId = null;
        const batchSize = 500;
        let hasMoreMessages = true;
        while (hasMoreMessages) {
            const query = { senderId: userId, 'attachment.publicId': { $exists: true } };
            if (lastMsgId) query._id = { $gt: lastMsgId };
            const messages = await Message.find(query).sort({ _id: 1 }).limit(batchSize).select('attachment.publicId attachment.resourceType').lean();
            if (messages.length < batchSize) hasMoreMessages = false;
            if (messages.length > 0) {
                lastMsgId = messages[messages.length - 1]._id;
                messages.forEach(msg => {
                    if (msg.attachment?.publicId) {
                        const type = msg.attachment.resourceType === 'video' ? 'video' : 'image';
                        assetIdsToDelete[type].add(msg.attachment.publicId);
                    }
                });
            }
        }
        
        logger.info('Collected all assets for user deletion.', {
            ...logContext,
            imageCount: assetIdsToDelete.image.size,
            videoCount: assetIdsToDelete.video.size,
            rawCount: assetIdsToDelete.raw.size,
        });

        if (assetIdsToDelete.image.size > 0) assetCleanupService.queueAssetDeletion([...assetIdsToDelete.image], 'image');
        if (assetIdsToDelete.video.size > 0) assetCleanupService.queueAssetDeletion([...assetIdsToDelete.video], 'video');
        if (assetIdsToDelete.raw.size > 0) assetCleanupService.queueAssetDeletion([...assetIdsToDelete.raw], 'raw');
    }
};