
const Program = require('../models/Program');
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const ProgramCategory = require('../models/ProgramCategory');
const User = require('../models/User');
const Translation = require('../models/Translation');
const { logger } = require('../utils/logger');
const cloudinary = require('../utils/cloudinaryConfig');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Coach = require('../models/Coach');
const PricingService = require('../services/PricingService');
const paymentService = require('../services/paymentService');
const Comment = require('../models/Comment');
const unifiedNotificationService = require('../services/unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const DurationCalculationService = require('../services/DurationCalculationService');
const Discount = require('../models/Discount');
const DiscountUsage = require('../models/DiscountUsage');
const axios = require('axios');
const assetCleanupService = require('../services/assetCleanupService');

exports.getUploadSignature = (req, res) => {
  try {
    const { uploadType } = req.body;
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    let paramsToSign = { timestamp };
    
    switch (uploadType) {
      case 'trailer':
        paramsToSign.upload_preset = 'coach_videos';
        paramsToSign.folder = `programs/${req.user.id}/trailers`;
        break;
      case 'lessonThumbnail':
        paramsToSign.upload_preset = 'program_images';
        paramsToSign.folder = `programs/lessons/${req.user._id}/thumbnails`;
        break;
      case 'lessonContent':
        paramsToSign.upload_preset = 'private_lesson_content';
        paramsToSign.folder = `programs/lessons/${req.user._id}`;
        break;
      default:
        logger.warn('[getUploadSignature] Invalid upload type requested.', { uploadType });
        return res.status(400).json({ message: 'Invalid upload type specified.' });
    }

     console.log('[!!!] PARAMS BEING SIGNED FOR UPLOAD:', { uploadType, paramsToSign });

    const stringToSign = Object.keys(paramsToSign).sort().map(key => `${key}=${paramsToSign[key]}`).join('&');
    console.log('[getUploadSignature] Generating signature.', { 
        uploadType, 
        stringToSignForVerification: stringToSign 
    });

    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

    const responsePayload = {
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      ...paramsToSign
    };
   
    console.log('[!!!] FINAL PAYLOAD BEING SENT TO CLIENT:', responsePayload);
    
   res.json(responsePayload);
  } catch (error) {
    logger.error('Error generating upload signature:', { error: error.message, uploadType: req.body.uploadType });
    res.status(500).json({ message: 'Error generating signature', error: error.message });
  }
};

const isProgramCoach = async (programId, userId) => {
    const program = await Program.findById(programId);
    return program && program.coach.equals(userId);
};

const isUserEnrolledInLessonProgram = async (lessonId, userId) => {
    const lesson = await Lesson.findById(lessonId).select('program').lean();
    if (!lesson) return false;
    const enrollment = await Enrollment.findOne({ user: userId, program: lesson.program }).lean();
    return !!enrollment;
};

const enrichProgramWithCategoryTranslation = async (program, language) => {
    if (!program || !program.categories || program.categories.length === 0 || !language) {
        return program.toObject ? program.toObject() : program;
    }

    const programObj = program.toObject ? program.toObject() : { ...program };
    const categoryIds = programObj.categories.map(cat => cat._id.toString());
    const translationKeys = categoryIds.map(id => `program_categories_${id}`);

    const translations = await Translation.find({
        key: { $in: translationKeys },
        [`translations.name.${language}`]: { $exists: true, $ne: null, $ne: '' }
    }).lean();

    const translationMap = new Map();
    translations.forEach(t => {
        const itemId = t.key.split('_').pop();
        if (t.translations.name && t.translations.name[language]) {
            translationMap.set(itemId, t.translations.name[language]);
        }
    });

    programObj.categories = programObj.categories.map(cat => ({
        ...cat,
        translation: translationMap.get(cat._id.toString()) || null
    }));

    return programObj;
};

const enrichFilesWithSignedUrls = async (program) => {
    if (!program) {
        console.log('[LOG-ONLY] enrichFilesWithSignedUrls called with null program. Exiting.');
        return;
    }
    console.log(`\n--- [LOG-ONLY] 1. enrichFilesWithSignedUrls CALLED for program ID: ${program._id} ---`);

    const expiration = Math.floor(Date.now() / 1000) + 3600;

    if (program.trailerVideo?.publicId) {
        // Trailer logic remains, no logs needed here as it works.
        program.trailerVideo.url = cloudinary.url(program.trailerVideo.publicId, {
            resource_type: 'video',
            type: 'private',
            sign_url: true,
            expires_at: expiration,
        });
        program.trailerVideo.thumbnail = cloudinary.url(program.trailerVideo.publicId, {
            resource_type: 'video',
            type: 'private',
            transformation: [{ seek: '1.0' }, { fetch_format: 'jpg' }],
            sign_url: true,
            expires_at: expiration,
        });
        if (!program.trailerVideo.filmstripUrl) {
            try {
                const vttPublicId = `${program.trailerVideo.publicId}.vtt`;
                const filmstripOptions = {
                    resource_type: 'video',
                    type: 'private',
                    transformation: [
                      { width: 600, height: 56, crop: 'fill' },
                      { flags: 'sprite', fps: 0.5 }
                    ],
                    sign_url: true,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                };
                const vttUrl = cloudinary.url(vttPublicId, filmstripOptions);
                const vttResponse = await axios.get(vttUrl);
                const vttContent = vttResponse.data;
                const jpgFilenameMatch = vttContent.match(/^(.*\.jpg)/m);
                if (jpgFilenameMatch && jpgFilenameMatch[1]) {
                    const extractedJpgFilename = jpgFilenameMatch[1];
                    const baseUrl = vttUrl.substring(0, vttUrl.lastIndexOf('/') + 1);
                    program.trailerVideo.filmstripUrl = baseUrl + extractedJpgFilename;
                } else { program.trailerVideo.filmstripUrl = null; }
            } catch (error) {
                program.trailerVideo.filmstripUrl = null;
            }
        }
    }

    if (program.modules) {
        for (const module of program.modules) {
            if (!module.lessons) continue;
            for (const lesson of module.lessons) {
                 if ((lesson.contentType === 'video' || lesson.contentType === 'document') && lesson.content?.files?.length > 0) {
                    console.log(`[LOG-ONLY] 2. Processing Lesson ID: ${lesson._id}, Title: "${lesson.title}", Type from DB: "${lesson.contentType}"`);
                    for (const file of lesson.content.files) {
                        if (file.publicId) {
                            console.log(`[LOG-ONLY] 3.   - Processing File with publicId: "${file.publicId}"`);
                            
                            const originalFileObject = JSON.stringify(file);
                            console.log(`[LOG-ONLY] 4.     - Original file object from DB: ${originalFileObject}`);

                            let resourceTypeForSigning = file.resourceType || 'auto';
                            console.log(`[LOG-ONLY] 5.     - Initial resourceType decision: "${resourceTypeForSigning}" (from file.resourceType || 'auto')`);

                            if (lesson.contentType === 'video') {
                                resourceTypeForSigning = 'video';
                                console.log(`[LOG-ONLY] 6.     - OVERRIDE: lesson.contentType is 'video', forcing resourceTypeForSigning to: "${resourceTypeForSigning}"`);
                            }

                            const signingOptions = {
                                resource_type: resourceTypeForSigning,
                                type: 'private',
                                sign_url: true,
                                expires_at: expiration,
                            };
                            console.log(`[LOG-ONLY] 7.     - Final options object passed to cloudinary.url(): ${JSON.stringify(signingOptions)}`);
                            
                            file.url = cloudinary.url(file.publicId, signingOptions);
                            console.log(`[LOG-ONLY] 8.     - Generated URL: ${file.url}`);

                             if (file.mimeType?.startsWith('video') || lesson.contentType === 'video') {
                                const thumbnailOptions = {
                                    resource_type: 'video',
                                    type: 'private',
                                    transformation: [{ seek: '1.0' }, { fetch_format: 'jpg' }],
                                    sign_url: true,
                                    expires_at: expiration,
                                };
                                console.log(`[LOG-ONLY] 8a.    - THUMBNAIL SIGNING: Generating thumbnail for publicId: "${file.publicId}" with options: ${JSON.stringify(thumbnailOptions)}`);
                                file.thumbnail = cloudinary.url(file.publicId, thumbnailOptions);
                                console.log(`[LOG-ONLY] 8b.    - THUMBNAIL SIGNING: Generated thumbnail URL: ${file.thumbnail}`);
                            }
                        } else {
                           console.log(`[LOG-ONLY] -- SKIPPING FILE in lesson ${lesson._id} because it has no publicId.`);
                        }
                    }
                }
            }
        }
    }
    console.log(`--- [LOG-ONLY] 9. enrichFilesWithSignedUrls FINISHED for program ID: ${program._id} ---\n`);
};

exports.createProgram = async (req, res) => {
    console.log('\n\n--- [CREATE PROGRAM] 1. =================== EXECUTION STARTED =================== ---');
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        console.log('--- [CREATE PROGRAM] 2. Parsing programData from req.body...');
        const programData = JSON.parse(req.body.programData);
        console.log('--- [CREATE PROGRAM] 2a. Parsed programData successfully.');

        const uploadPromises = [];
        
        console.log('--- [CREATE PROGRAM] 4. Checking for files in request...');
        if (req.files) {
            if (req.files.programImages) {
                const imageFiles = Array.isArray(req.files.programImages) ? req.files.programImages : [req.files.programImages];
                console.log(`--- [CREATE PROGRAM] 4a. FOUND ${imageFiles.length} IMAGE FILE(S).`);

                imageFiles.forEach(file => {
                    const uploadOptions = {
                        folder: `programs/${req.user._id}/temp_program_id`, // Placeholder folder
                        resource_type: 'image',
                        type: 'private',
                        upload_preset: 'program_images'
                    };
                    uploadPromises.push(
                        cloudinary.uploader.upload(file.tempFilePath, uploadOptions)
                        .then(result => ({ type: 'image', url: result.secure_url, publicId: result.public_id }))
                    );
                });
            }
            if (req.files.programTrailerVideo) {
                const file = req.files.programTrailerVideo;
                console.log(`--- [CREATE PROGRAM] 4b. FOUND TRAILER VIDEO FILE.`);
                 uploadPromises.push(
                    cloudinary.uploader.upload(file.tempFilePath, {
                        folder: `programs/${req.user._id}/temp_program_id`, // Placeholder
                        resource_type: 'video',
                        type: 'private'
                    }).then(result => ({
                        type: 'trailer',
                        publicId: result.public_id,
                        url: result.secure_url,
                        width: result.width,
                        height: result.height,
                        duration: result.duration
                    }))
                );
            }
        } else {
            console.log('--- [CREATE PROGRAM] 4a. NO FILES FOUND in req.files.');
        }
        
        console.log(`--- [CREATE PROGRAM] 5. Awaiting ${uploadPromises.length} Cloudinary upload promise(s) to resolve...`);
        const uploadResults = await Promise.all(uploadPromises);
        console.log('--- [CREATE PROGRAM] 5a. All Cloudinary promises resolved.');

        const trailerResult = uploadResults.find(r => r.type === 'trailer');
        if (trailerResult) {
            programData.trailerVideo = {
                publicId: trailerResult.publicId,
                url: trailerResult.url,
                width: trailerResult.width,
                height: trailerResult.height,
                duration: trailerResult.duration,
            };
        }

        const newUploadedImages = uploadResults.filter(r => r.type === 'image');
        let newImageIndex = 0;
        if (programData.programImages && Array.isArray(programData.programImages)) {
            programData.programImages = programData.programImages.map(img => {
                const uploadedImage = newUploadedImages[newImageIndex++];
                if (uploadedImage) {
                    return { ...img, url: uploadedImage.url, publicId: uploadedImage.publicId };
                }
                return null;
            }).filter(Boolean);
        }

        console.log('--- [CREATE PROGRAM] 3. Creating initial Program document in database...');
        const newProgram = new Program({
            ...programData,
            coach: req.user._id,
            status: 'draft'
        });
        await newProgram.save({ session });
        const programId = newProgram._id;
        console.log('--- [CREATE PROGRAM] 3a. Initial Program saved. Got ID:', programId);

        // Now that we have the real programId, we can rename the assets' folder
        const movePromises = [];
        const oldPrefix = `programs/${req.user._id}/temp_program_id/`;
        const newPrefix = `programs/${req.user._id}/${programId}/`;

        if (newProgram.programImages) {
            newProgram.programImages.forEach(image => {
                if (image.publicId && image.publicId.startsWith(oldPrefix)) {
                    const newPublicId = image.publicId.replace(oldPrefix, newPrefix);
                    movePromises.push(cloudinary.uploader.rename(image.publicId, newPublicId, { type: 'private' }));
                    image.publicId = newPublicId;
                }
            });
        }
        if (newProgram.trailerVideo && newProgram.trailerVideo.publicId && newProgram.trailerVideo.publicId.startsWith(oldPrefix)) {
            const newPublicId = newProgram.trailerVideo.publicId.replace(oldPrefix, newPrefix);
            movePromises.push(cloudinary.uploader.rename(newProgram.trailerVideo.publicId, newPublicId, { resource_type: 'video', type: 'private' }));
            newProgram.trailerVideo.publicId = newPublicId;
        }

        if (movePromises.length > 0) {
            await Promise.all(movePromises);
        }

        console.log('--- [CREATE PROGRAM] 7. Saving final Program document with all data...');
        await newProgram.save({ session });
        console.log('--- [CREATE PROGRAM] 7a. Final Program document saved.');

        console.log('--- [CREATE PROGRAM] 8. Committing database transaction...');
        await session.commitTransaction();
        session.endSession();
        console.log('--- [CREATE PROGRAM] 8a. Transaction committed.');

        await newProgram.populate(['categories', 'coach']);
        const language = req.user.preferredLanguage || 'en';
        const enrichedProgram = await enrichProgramWithCategoryTranslation(newProgram, language);
        
        console.log('--- [CREATE PROGRAM] 9. SUCCESS. Sending 201 response to client.');
        res.status(201).json(enrichedProgram);

    } catch (error) {
        console.error('--- [CREATE PROGRAM] X. =================== CATCH BLOCK TRIGGERED =================== ---');
        console.error('--- [CREATE PROGRAM] Xa. Raw Error Object:', error);
        
        if (session.inTransaction()) {
            console.error('--- [CREATE PROGRAM] Xb. Aborting active database transaction...');
            await session.abortTransaction();
            console.error('--- [CREATE PROGRAM] Xc. Transaction aborted.');
        }
        session.endSession();
        
        logger.error('Error creating program', { 
            errorName: error.name,
            errorMessage: error.message, 
            stack: error.stack,
            http_code: error.http_code,
            cloudinary_error: error.error 
        });
        
        console.error('--- [CREATE PROGRAM] Xd. Sending 500 error response to client.');
        res.status(500).json({ message: 'Error creating program', error: error.message });
    }
};

exports.updateProgramDetails = async (req, res) => {
    // --- CONSOLE LOG: Start of Function ---
    console.log(`\n--- [UPDATE_PROGRAM_DETAILS] Request received for programId: ${req.params.programId} ---`);
    console.log(`--- User ID: ${req.user._id} ---`);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const stripTransientData = (lessonData) => {
            if (lessonData.content?.files?.length > 0) {
                lessonData.content.files.forEach(file => {
                    delete file.thumbnailUrl;
                });
            }
            return lessonData;
        };

        const { programId } = req.params;

        if (!await isProgramCoach(programId, req.user._id)) {
            console.log(`[UPDATE_PROGRAM_DETAILS] FORBIDDEN: User ${req.user._id} is not the coach of program ${programId}.`);
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden: You are not the coach of this program.' });
        }
        
        // --- START: ASSET DELETION LOGIC (STEP 1: FETCH "BEFORE" STATE) ---
        console.log('[UPDATE_PROGRAM_DETAILS] CLEANUP-LOGIC-1: Fetching current program state for asset diffing.');
        const existingProgram = await Program.findById(programId)
            .populate({ path: 'modules', populate: 'lessons' })
            .session(session);
        
        if (!existingProgram) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Program not found.' });
        }

        const initialAssets = new Map();
        existingProgram.programImages.forEach(img => img.publicId && initialAssets.set(img.publicId, { type: 'image' }));
        if (existingProgram.trailerVideo?.publicId) initialAssets.set(existingProgram.trailerVideo.publicId, { type: 'video' });
        existingProgram.modules.forEach(mod => mod.lessons.forEach(les => {
            les.content?.files?.forEach(file => {
                if (file.publicId) initialAssets.set(file.publicId, { type: file.resourceType || 'auto' });
            });
            les.content?.presentation?.slides?.forEach(slide => {
                if (slide.imagePublicId) initialAssets.set(slide.imagePublicId, { type: 'image' });
                if (slide.audioPublicId) initialAssets.set(slide.audioPublicId, { type: 'video' });
            });
        }));
        console.log(`[UPDATE_PROGRAM_DETAILS] CLEANUP-LOGIC-2: Found ${initialAssets.size} initial assets before update.`);
        // --- END: ASSET DELETION LOGIC (STEP 1) ---

        const programData = JSON.parse(req.body.programData);
        const deletedImageIds = JSON.parse(req.body.deletedImageIds || '[]');

        console.log('[UPDATE_PROGRAM_DETAILS] Parsed programData from request body:', JSON.stringify(programData, null, 2));

        // --- CONSOLE LOG: File Uploads ---
        console.log('[UPDATE_PROGRAM_DETAILS] Checking for file uploads...');
        
        const uploadPromises = [];
          if (req.files) {
            // Handle Program Images
            if (req.files.programImages) {
                const imageFiles = Array.isArray(req.files.programImages) ? req.files.programImages : [req.files.programImages];
                console.log(`[UPDATE_PROGRAM_DETAILS] Found ${imageFiles.length} new program images to upload.`);
                imageFiles.forEach(file => {
                    const uploadOptions = {
                        folder: `programs/${req.user._id}/${programId}`,
                        resource_type: 'image',
                        type: 'private',
                        upload_preset: 'program_images'
                    };
                    console.log('[updateProgramDetails] Uploading image with options:', uploadOptions);
                    uploadPromises.push(
                        cloudinary.uploader.upload(file.tempFilePath, uploadOptions)
                        .then(result => ({ type: 'image', url: result.secure_url, publicId: result.public_id }))
                    );
                });
            }

            // Handle Trailer Video
            if (req.files.programTrailerVideo) {
                console.log('[UPDATE_PROGRAM_DETAILS] Found new trailer video to upload.');
                const file = req.files.programTrailerVideo;
                uploadPromises.push(
                    cloudinary.uploader.upload(file.tempFilePath, {
                        folder: `programs/${req.user._id}/${programId}`,
                        resource_type: 'video',
                        type: 'private'
                    }).then(result => ({ 
                        type: 'trailer', 
                        url: result.secure_url, 
                        publicId: result.public_id,
                        width: result.width,
                        height: result.height,
                        duration: result.duration
                    }))
                );
            }
            
            // Handle Lesson Videos
            Object.keys(req.files).forEach(key => {
                if (key.startsWith('lesson_video_')) {
                    const tempLessonId = key.replace('lesson_video_', '');
                    const file = req.files[key];
                    console.log(`[UPDATE_PROGRAM_DETAILS] Found new video for temporary lesson ID: ${tempLessonId}.`);
                    uploadPromises.push(
                        cloudinary.uploader.upload(file.tempFilePath, {
                            folder: `programs/${req.user._id}/${programId}/lessons`,
                            resource_type: 'video',
                            type: 'private'
                        }).then(result => {
                            return { 
                                type: 'lesson_video', 
                                tempLessonId, 
                                url: result.secure_url, 
                                publicId: result.public_id,
                                width: result.width,
                                height: result.height,
                                duration: result.duration,
                                fileName: file.name,
                                mimeType: file.mimetype
                            };
                        })
                    );
                }
            });
        }

        const uploadResults = await Promise.all(uploadPromises);
        console.log(`[UPDATE_PROGRAM_DETAILS] Cloudinary uploads complete. Results count: ${uploadResults.length}`);

        const newUploadedImages = uploadResults.filter(r => r.type === 'image');
        let newImageIndex = 0;
        if (programData.programImages && Array.isArray(programData.programImages)) {
            programData.programImages = programData.programImages.map(img => {
                if (!img.publicId) { 
                    const uploadedImage = newUploadedImages[newImageIndex++];
                    if (uploadedImage) {
                        return { ...img, url: uploadedImage.url, publicId: uploadedImage.publicId };
                    }
                    return null;
                }
                return img;
            }).filter(Boolean);
        }

        const trailerResult = uploadResults.find(r => r.type === 'trailer');
        if (trailerResult) {
            programData.trailerVideo = {
                publicId: trailerResult.publicId,
                url: trailerResult.url,
                width: trailerResult.width,
                height: trailerResult.height,
                duration: trailerResult.duration,
            };
        }
        
        const newLessonVideos = uploadResults.filter(r => r.type === 'lesson_video');
        if (newLessonVideos.length > 0) {
            const videoMap = new Map(newLessonVideos.map(v => [v.tempLessonId, v]));
            programData.modules.forEach(module => {
                module.lessons.forEach(lesson => {
                    if (videoMap.has(lesson._id)) {
                        const videoResult = videoMap.get(lesson._id);
                        lesson.content.files = [{
                            publicId: videoResult.publicId,
                            url: videoResult.url,
                            width: videoResult.width,
                            height: videoResult.height,
                            duration: videoResult.duration,
                            fileName: videoResult.fileName,
                            mimeType: videoResult.mimeType,
                            resourceType: 'video',
                        }];
                        if (lesson.contentDuration?.source !== 'manual') {
                             lesson.contentDuration = {
                                minutes: Math.round(videoResult.duration / 60) || 1,
                                source: 'auto_video'
                             };
                        }
                    }
                });
            });
        }

        console.log('[UPDATE_PROGRAM_DETAILS] Starting to process modules and lessons...');

        const updatedModuleIds = [];
        if (programData.modules && Array.isArray(programData.modules)) {
            for (const [moduleIndex, moduleData] of programData.modules.entries()) {
                let currentModule;
                if (moduleData._id && mongoose.Types.ObjectId.isValid(moduleData._id)) {
                    await Module.updateOne({ _id: moduleData._id }, { $set: { 
                        title: moduleData.title, 
                        order: moduleData.order ?? moduleIndex,
                        'contentDuration.isOverridden': moduleData.contentDuration?.isOverridden,
                        'contentDuration.minutes': moduleData.contentDuration?.isOverridden ? moduleData.contentDuration.minutes : undefined,
                        'estimatedCompletionTime.isOverridden': moduleData.estimatedCompletionTime?.isOverridden,
                        'estimatedCompletionTime.minutes': moduleData.estimatedCompletionTime?.isOverridden ? moduleData.estimatedCompletionTime.minutes : undefined
                    }}, { session, omitUndefined: true });
                    currentModule = await Module.findById(moduleData._id).session(session);
                } else {
                    const { _id, ...restOfModuleData } = moduleData;
                    currentModule = new Module({ ...restOfModuleData, program: programId, order: moduleData.order ?? moduleIndex, lessons: [] });
                    await currentModule.save({ session });
                }
                updatedModuleIds.push(currentModule._id);

                console.log(`[UPDATE_PROGRAM_DETAILS] Processed module: ${currentModule.title} (ID: ${currentModule._id})`);

                if (moduleData.lessons && Array.isArray(moduleData.lessons)) {
                    const lessonIdsForModule = [];
                    for (const [lessonIndex, lessonData] of moduleData.lessons.entries()) {
                        let lessonUpdateData = {
                            title: lessonData.title,
                            order: lessonData.order ?? lessonIndex,
                            contentType: lessonData.contentType,
                            content: stripTransientData(lessonData).content,
                            'estimatedCompletionTime.minutes': lessonData.estimatedCompletionTime?.minutes || 0,
                            'contentDuration.minutes': lessonData.contentDuration?.minutes || 0,
                            'contentDuration.source': lessonData.contentDuration?.source || 'manual'
                        };
                        
                        if (lessonData._id && mongoose.Types.ObjectId.isValid(lessonData._id)) {
                            await Lesson.updateOne({ _id: lessonData._id }, { $set: lessonUpdateData }, { session });
                            lessonIdsForModule.push(lessonData._id);
                        } else {
                            const { _id, ...restOfLessonData } = lessonData;
                            const newLesson = new Lesson({
                                ...restOfLessonData,
                                ...lessonUpdateData,
                                program: programId,
                                module: currentModule._id
                            });
                            await newLesson.save({ session });
                            lessonIdsForModule.push(newLesson._id);
                            console.log(`[UPDATE_PROGRAM_DETAILS]   - Created new lesson: ${newLesson.title}`);
                        }
                    }
                    await Module.updateOne({ _id: currentModule._id }, { $set: { lessons: lessonIdsForModule } }, { session });
                }
            }
        }
        
        const updatePayload = { ...programData };
        updatePayload.modules = updatedModuleIds;

        await Program.findByIdAndUpdate(
            programId,
            { $set: updatePayload },
            { new: true, runValidators: true, session }
        );

        console.log('[UPDATE_PROGRAM_DETAILS] Main program document updated.');
        
        console.log('[UPDATE_PROGRAM_DETAILS] Committing database transaction...');
        await session.commitTransaction();
        console.log('[UPDATE_PROGRAM_DETAILS] Transaction committed successfully.');

        // --- START: ASSET DELETION LOGIC (STEP 2: CALCULATE DIFF & QUEUE) ---
        console.log('[UPDATE_PROGRAM_DETAILS] CLEANUP-LOGIC-3: Calculating asset difference for deletion.');
        const finalAssets = new Set();
        programData.programImages?.forEach(img => img.publicId && finalAssets.add(img.publicId));
        if (programData.trailerVideo?.publicId) finalAssets.add(programData.trailerVideo.publicId);
        programData.modules?.forEach(mod => mod.lessons?.forEach(les => {
            les.content?.files?.forEach(file => file.publicId && finalAssets.add(file.publicId));
            les.content?.presentation?.slides?.forEach(slide => {
                if (slide.imagePublicId) finalAssets.add(slide.imagePublicId);
                if (slide.audioPublicId) finalAssets.add(slide.audioPublicId);
            });
        }));
        console.log(`[UPDATE_PROGRAM_DETAILS] CLEANUP-LOGIC-4: Found ${finalAssets.size} final assets in the payload.`);

        const assetsToDelete = new Map();
        for (const [publicId, assetInfo] of initialAssets.entries()) {
            if (!finalAssets.has(publicId)) {
                assetsToDelete.set(publicId, assetInfo);
            }
        }

        // Also include manually deleted images
        deletedImageIds.forEach(id => {
            if (initialAssets.has(id)) {
                assetsToDelete.set(id, initialAssets.get(id));
            }
        });

        if (assetsToDelete.size > 0) {
            console.log(`[assetCleanup] updateProgramDetails: Found ${assetsToDelete.size} assets to be deleted after update diff.`);
            const groupedForDeletion = { image: [], video: [], auto: [] };
            for (const [publicId, assetInfo] of assetsToDelete.entries()) {
                if (assetInfo.type === 'image') groupedForDeletion.image.push(publicId);
                else if (assetInfo.type === 'video') groupedForDeletion.video.push(publicId);
                else groupedForDeletion.auto.push(publicId);
            }
            
            if (groupedForDeletion.image.length > 0) {
                console.log(`[assetCleanup] updateProgramDetails: Queuing ${groupedForDeletion.image.length} 'image' assets for deletion.`, groupedForDeletion.image);
                assetCleanupService.queueAssetDeletion(groupedForDeletion.image, 'image');
            }
            if (groupedForDeletion.video.length > 0) {
                console.log(`[assetCleanup] updateProgramDetails: Queuing ${groupedForDeletion.video.length} 'video' assets for deletion.`, groupedForDeletion.video);
                assetCleanupService.queueAssetDeletion(groupedForDeletion.video, 'video');
            }
            if (groupedForDeletion.auto.length > 0) {
                console.log(`[assetCleanup] updateProgramDetails: Queuing ${groupedForDeletion.auto.length} 'auto' assets for deletion.`, groupedForDeletion.auto);
                assetCleanupService.queueAssetDeletion(groupedForDeletion.auto, 'auto');
            }
        } else {
            console.log('[UPDATE_PROGRAM_DETAILS] CLEANUP-LOGIC-5: No assets were removed in this update.');
        }

        console.log('[UPDATE_PROGRAM_DETAILS] Triggering background duration recalculation service...');
        DurationCalculationService.recalculateAndSaveProgramDurations(programId)
            .catch(err => logger.error('Failed to run background duration calculation after update.', { programId, err }));
        
        Program.recalculateAndSaveDerivedData(programId)
            .catch(err => logger.error('Failed to run background derived data calculation after update.', { programId, err }));

        session.endSession();

        console.log('[UPDATE_PROGRAM_DETAILS] Fetching final program data to send in response.');
        const finalProgram = await Program.findById(programId)
            .populate({ path: 'modules', populate: { path: 'lessons' } })
            .populate('categories')
            .populate('language')
            .populate('skillLevel')
            .lean();
        
        await enrichFilesWithSignedUrls(finalProgram);
        const enrichedProgram = await enrichProgramWithCategoryTranslation(finalProgram, req.user.preferredLanguage || 'en');
        
        console.log('--- [UPDATE_PROGRAM_DETAILS] Request finished successfully. ---');
        res.status(200).json(enrichedProgram);

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        
        console.error('--- [UPDATE_PROGRAM_DETAILS] An error occurred. Transaction aborted. ---');
        logger.error('Error updating program details', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating program details', error: error.message });
    }
};

exports.addModule = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { programId } = req.params;
        const program = await Program.findById(programId).session(session);

        if (!program) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Program not found.' });
        }
        if (!program.coach.equals(req.user._id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden.' });
        }
        
        const order = program.modules.length;
        const newModule = new Module({ ...req.body, program: programId, lessons: [], order });
        await newModule.save({ session });
        
        program.modules.push(newModule._id);
        await program.save({ session });
        
        await session.commitTransaction();
        session.endSession();
        
        const populatedProgram = await Program.findById(programId)
            .populate({ path: 'modules', populate: { path: 'lessons' } })
            .populate('category')
            .lean();
            
        const enrichedProgram = await enrichProgramWithCategoryTranslation(populatedProgram, req.user.preferredLanguage || 'en');
        res.status(201).json(enrichedProgram);

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error adding module', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error adding module', error: error.message });
    }
};

exports.addLesson = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { moduleId } = req.params;
        const module = await Module.findById(moduleId);
        if (!module) return res.status(404).json({ message: 'Module not found.' });

        if (!await isProgramCoach(module.program, req.user._id)) {
            return res.status(403).json({ message: 'Forbidden.' });
        }
        
        const newLesson = new Lesson({ ...req.body, program: module.program, module: moduleId });
        await newLesson.save({ session });
        
        await Module.findByIdAndUpdate(moduleId, { $push: { lessons: newLesson._id } }, { session });
        const program = await Program.findByIdAndUpdate(module.program, { $inc: { totalLessons: 1 } }, { new: true, session });
        
        await session.commitTransaction();
        res.status(201).json(program);
    } catch (error) {
        await session.abortTransaction();
        logger.error('Error adding lesson', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error adding lesson', error: error.message });
    } finally {
        session.endSession();
    }
};

exports.getCoachPrograms = async (req, res) => {
    try {
        const { status, sort } = req.query;
        const language = req.user.preferredLanguage || 'en';

        const query = { coach: req.user._id };
        if (status && status !== 'all') {
            query.status = status;
        }

        const sortOptions = {};
        if (sort) {
            const [field, order] = sort.split('_');
            const sortOrder = order === 'desc' ? -1 : 1;
            const sortFieldMap = {
                updatedAt: 'updatedAt',
                enrollments: 'enrollmentsCount',
                rating: 'averageRating',
                title: 'title'
            };
            if (sortFieldMap[field]) {
                sortOptions[sortFieldMap[field]] = sortOrder;
            } else {
                sortOptions.updatedAt = -1;
            }
        } else {
            sortOptions.updatedAt = -1;
        }

        const programs = await Program.find(query)
            .populate({ path: 'modules', populate: { path: 'lessons' }})
            .populate('categories')
            .populate('language')
            .populate('skillLevel')
            .sort(sortOptions)
            .lean();

        if (programs.length === 0) {
            return res.status(200).json([]);
        }

        const programIds = programs.map(p => p._id);

        const revenueData = await Payment.aggregate([
            {
                $match: {
                    program: { $in: programIds },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$program',
                    totalRevenue: { $sum: '$amount.total' }
                }
            }
        ]);

        const revenueMap = new Map(revenueData.map(item => [item._id.toString(), item.totalRevenue]));

        const enrichedPrograms = await Promise.all(
            programs.map(async (p) => {
                await enrichFilesWithSignedUrls(p);
                p.revenue = revenueMap.get(p._id.toString()) || 0;
                return await enrichProgramWithCategoryTranslation(p, language);
            })
        );
        
        if (sort && sort.startsWith('revenue')) {
            const order = sort.split('_')[1];
            enrichedPrograms.sort((a, b) => {
                const revenueA = a.revenue || 0;
                const revenueB = b.revenue || 0;
                return order === 'desc' ? revenueB - revenueA : revenueA - revenueB;
            });
        }

        const coachIds = enrichedPrograms.map(p => p.coach._id.toString());
        const coaches = await Coach.find({ user: { $in: coachIds } }).select('user profilePicture').lean();
        const coachPictureMap = new Map(coaches.map(c => [c.user.toString(), c.profilePicture]));
        enrichedPrograms.forEach(p => {
            if (p.coach.role === 'coach') {
                p.coach.coachProfilePicture = coachPictureMap.get(p.coach._id.toString()) || null;
            }
        });

        res.status(200).json(enrichedPrograms);
    } catch (error) {
        logger.error('Error fetching coach programs', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching coach programs', error: error.message });
    }
};

exports.getProgramEnrollments = async (req, res) => {
    try {
        const { programId } = req.params;
        const program = await Program.findById(programId).select('coach').lean();

        if (!program) {
            return res.status(404).json({ message: 'Program not found.' });
        }

        if (!program.coach.equals(req.user._id)) {
            return res.status(403).json({ message: 'Forbidden: You are not the coach of this program.' });
        }
        
        const enrollments = await Enrollment.find({ program: programId })
            .populate('user', 'firstName lastName email profilePicture')
            .sort({ createdAt: -1 })
            .lean();
            
        res.status(200).json(enrollments);
    } catch (error) {
        logger.error('Error fetching program enrollments', { error: error.message, stack: error.stack, programId: req.params.programId });
        res.status(500).json({ message: 'Error fetching enrollments' });
    }
};

exports.getProgramQandA = async (req, res) => {
    try {
        const { programId } = req.params;
        const program = await Program.findById(programId).select('coach').lean();

        if (!program) {
            return res.status(404).json({ message: 'Program not found.' });
        }

        if (!program.coach.equals(req.user._id)) {
            return res.status(403).json({ message: 'Forbidden: You are not the coach of this program.' });
        }
        
        const lessons = await Lesson.find({ program: programId }).select('_id title').lean();
        if (lessons.length === 0) {
            return res.status(200).json([]);
        }
        const lessonIds = lessons.map(l => l._id);
        
        const allComments = await Comment.find({ lesson: { $in: lessonIds } })
            .populate({
                path: 'user',
                select: 'firstName lastName profilePicture role'
            })
            .sort({ createdAt: 1 }) // Sort ascending to build tree correctly
            .lean();

        const userIds = [...new Set(allComments.map(c => c.user?._id.toString()).filter(Boolean))];
        const coaches = await Coach.find({ user: { $in: userIds } }).select('user profilePicture').lean();
        const coachPictureMap = new Map(coaches.map(c => [c.user.toString(), c.profilePicture]));

        allComments.forEach(comment => {
            if (comment.user && comment.user.role === 'coach') {
                const coachPic = coachPictureMap.get(comment.user._id.toString());
                if (coachPic) {
                    comment.user.coachProfilePicture = coachPic;
                }
            }
        });

        const commentsByLesson = allComments.reduce((acc, comment) => {
            const lessonId = comment.lesson.toString();
            if (!acc[lessonId]) {
                acc[lessonId] = [];
            }
            acc[lessonId].push(comment);
            return acc;
        }, {});

        const buildTree = (comments = []) => {
            const commentMap = {};
            const tree = [];
            comments.forEach(comment => {
                commentMap[comment._id.toString()] = { ...comment, replies: [] };
            });
            comments.forEach(comment => {
                const parentId = comment.parentComment?.toString();
                if (parentId && commentMap[parentId]) {
                    commentMap[parentId].replies.push(commentMap[comment._id.toString()]);
                } else {
                    tree.push(commentMap[comment._id.toString()]);
                }
            });
            tree.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return tree;
        };

        const lessonMap = new Map(lessons.map(l => [l._id.toString(), l.title]));
        
        const result = Object.entries(commentsByLesson).map(([lessonId, commentsList]) => ({
            lessonId,
            lessonTitle: lessonMap.get(lessonId) || 'Unknown Lesson',
            comments: buildTree(commentsList),
            commentCount: commentsList.length
        }));

        result.sort((a, b) => {
             const latestCommentA = a.comments[0]?.createdAt || 0;
             const latestCommentB = b.comments[0]?.createdAt || 0;
             return new Date(latestCommentB) - new Date(latestCommentA);
        });

        res.status(200).json(result);
    } catch (error) {
        logger.error('Error fetching program comments for QA', { error: error.message, stack: error.stack, programId: req.params.programId });
        res.status(500).json({ message: 'Error fetching comments for QA' });
    }
};

exports.getPublishedPrograms = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        let filters = {};
        if (req.query.filters) {
            try {
                const parsedFilters = JSON.parse(req.query.filters);
                if (parsedFilters && typeof parsedFilters === 'object') {
                    filters = parsedFilters;
                }
            } catch (e) {
                logger.warn('Invalid filters JSON received', { filters: req.query.filters });
                return res.status(400).json({ message: 'Invalid filter format.' });
            }
        }
        
         const { 
            sortBy = 'popularity_desc',
            categories,
            price,
            features,
            language,
            skillLevel,
            learningOutcomes,
            contentDuration,
            estimatedCompletionTime,
            contentTypes,
            author
        } = filters;

        const query = { status: 'published' };

        if (learningOutcomes && typeof learningOutcomes === 'string' && learningOutcomes.length > 0) {
            query.learningOutcomes = { $all: learningOutcomes.split(',') };
        }

         if (author && typeof author === 'string' && author.length > 0) {
            query.coach = { $in: author.split(',') };
        }

        if (categories && typeof categories === 'string' && categories.length > 0) {
            query.categories = { $in: categories.split(',') };
        }

        if (language && typeof language === 'string' && language.length > 0) {
            query.language = { $in: language.split(',') };
        }

        if (skillLevel && typeof skillLevel === 'string' && skillLevel.length > 0) {
            query.skillLevel = { $in: skillLevel.split(',') };
        }

        if (price && Array.isArray(price) && price.length === 2) {
            const [minPrice, maxPrice] = price;
            const priceQuery = {};
            if (minPrice > 0) priceQuery.$gte = minPrice;
            if (maxPrice < 1000) priceQuery.$lte = maxPrice;
            if (Object.keys(priceQuery).length > 0) {
                query['basePrice.amount'] = priceQuery;
            }
        }
        
       const applyDurationFilterToQuery = (fieldName, durationString) => {
            if (!durationString || typeof durationString !== 'string' || durationString.length === 0) {
                return;
            }
            const orConditions = durationString.split(',').map(bucket => {
                const [min, max] = bucket.split('-').map(val => parseInt(val, 10));
                const condition = {};
                if (!isNaN(min)) condition.$gte = min;
                if (!isNaN(max)) condition.$lte = max;
                return Object.keys(condition).length > 0 ? { [fieldName]: condition } : null;
            }).filter(Boolean);

            if (orConditions.length > 0) {
                if (!query.$and) {
                    query.$and = [];
                }
                query.$and.push({ $or: orConditions });
            }
        };
        
        applyDurationFilterToQuery('contentDuration.minutes', contentDuration);
        applyDurationFilterToQuery('estimatedCompletionTime.minutes', estimatedCompletionTime);

if (contentTypes && typeof contentTypes === 'string' && contentTypes.length > 0) {
            query.availableContentTypes = { $in: contentTypes.split(',') };
        }

        console.log('[getPublishedPrograms] Executing query with filters:', JSON.stringify(filters, null, 2));
        console.log('[getPublishedPrograms] Final Mongoose query object:', JSON.stringify(query, null, 2));

        if (features && features.includes('discussion')) {
            query.isDiscussionEnabled = true;
        }

        const sortOptions = {};
        switch(sortBy) {
            case 'price_asc':
                sortOptions['basePrice.amount'] = 1;
                break;
            case 'price_desc':
                sortOptions['basePrice.amount'] = -1;
                break;
            case 'createdAt_desc':
                sortOptions.createdAt = -1;
                break;
            case 'sales_desc':
                sortOptions.enrollmentsCount = -1;
                break;
             case 'popularity_desc':
            default:
                sortOptions.averageRating = -1;
                sortOptions.enrollmentsCount = -1;
                break;
        }

        const totalDocs = await Program.countDocuments(query);
        const programs = await Program.find(query)
            .populate('coach', 'firstName lastName profilePicture')
            .populate('categories')
            .populate('skillLevel')
            .populate('language')
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .lean();
        
             if (programs.length > 0) {
            const coachUserIds = [...new Set(programs.map(p => p.coach?._id?.toString()).filter(Boolean))];

            if (coachUserIds.length > 0) {
                logger.debug('[getPublishedPrograms] Fetching coach-specific profiles for user IDs:', coachUserIds);
                const coachProfiles = await Coach.find({ user: { $in: coachUserIds } })
                    .select('user profilePicture')
                    .lean();

                const coachProfilePictureMap = new Map(
                    coachProfiles.map(coach => [coach.user.toString(), coach.profilePicture])
                );

                programs.forEach(program => {
                    if (program.coach) {
                        const coachProfilePicture = coachProfilePictureMap.get(program.coach._id.toString());
                        if (coachProfilePicture) {
                            // Attach the coach-specific picture to the populated 'coach' (User) object.
                            program.coach.coachProfilePicture = coachProfilePicture;
                        }
                    }
                });
            }
        }

        res.status(200).json({
            docs: programs,
            totalDocs,
            limit,
            page,
            totalPages: Math.ceil(totalDocs / limit),
            hasNextPage: page < Math.ceil(totalDocs / limit),
        });
    } catch (error) {
        logger.error('Error fetching published programs', { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error fetching published programs." });
    }
};

exports.getProgramLandingPage = async (req, res) => {
    console.log(`--- [getProgramLandingPage] 1. Request received for programId: ${req.params.programId}. User ID: ${req.user?._id}`);
    try {
       const program = await Program.findById(req.params.programId)
                .populate('coach', 'firstName lastName profilePicture role')
                .populate({
                    path: 'modules',
                    select: 'title order lessons contentDuration estimatedCompletionTime',
                    populate: {
                        path: 'lessons',
                        select: 'title order contentType content.duration contentDuration estimatedCompletionTime'
                    }
                })
                .populate('skillLevel')
                .populate('language')
                .populate('categories');

        if (!program) {
            console.log(`--- [getProgramLandingPage] 2. FAIL: Program.findById returned null. No program found with ID: ${req.params.programId}`);
            return res.status(404).json({ message: 'Program not found.' });
        }
        console.log(`--- [getProgramLandingPage] 2. SUCCESS: Found program titled "${program.title}" with status "${program.status}".`);

        const isOwner = req.user && program.coach && program.coach._id.equals(req.user._id);
        console.log(`--- [getProgramLandingPage] 3. Ownership Check: Program Coach ID = ${program.coach?._id}, Requesting User ID = ${req.user?._id}. Result: isOwner = ${isOwner}`);

        if (program.status !== 'published' && !isOwner) {
            console.log(`--- [getProgramLandingPage] 4. REJECT: Program is not published AND user is not the owner. Responding with 404.`);
            return res.status(404).json({ message: 'Program not found or not published.' });
        }
        console.log(`--- [getProgramLandingPage] 4. ALLOW: Access granted.`);
        
        // The original logic for stat recalculation remains intact
        let totalLessons = 0;
        let totalDurationSeconds = 0;
        program.modules.forEach(mod => {
            totalLessons += mod.lessons.length;
            mod.lessons.forEach(les => {
                if (les.contentType === 'video' && les.content && les.content.files) {
                    les.content.files.forEach(file => {
                        if (file.duration) {
                            totalDurationSeconds += file.duration;
                        }
                    });
                }
            });
        });
        const totalDurationMinutes = totalDurationSeconds / 60;
        const actualEnrollmentsCount = await Enrollment.countDocuments({ program: program._id });

        if (program.totalLessons !== totalLessons || program.totalDurationMinutes !== totalDurationMinutes || program.enrollmentsCount !== actualEnrollmentsCount) {
            program.totalLessons = totalLessons;
            program.totalDurationMinutes = totalDurationMinutes;
            program.enrollmentsCount = actualEnrollmentsCount;
            await program.save();
        }

        // --- START: Profile Picture Enrichment Logic ---
        // Convert the Mongoose document to a plain object to safely add the new property.
        const programResponse = program.toObject(); 

        if (programResponse.coach && programResponse.coach.role === 'coach') {
            logger.debug(`[getProgramLandingPage] Fetching coach-specific profile for user ID: ${programResponse.coach._id}`);
            const coachProfile = await Coach.findOne({ user: programResponse.coach._id })
                .select('profilePicture')
                .lean();

            if (coachProfile?.profilePicture) {
                // Attach the coach-specific picture to the populated 'coach' (User) object.
                programResponse.coach.coachProfilePicture = coachProfile.profilePicture;
            }
        }
        // --- END: Profile Picture Enrichment Logic ---
        console.log(`--- [getProgramLandingPage] 5. Sending successful response to client.`);
        res.status(200).json(programResponse);
    } catch (error) {
        logger.error('Error fetching program landing page.', { error: error.message, stack: error.stack });
        console.error(`--- [getProgramLandingPage] X. CATCH BLOCK: An error occurred.`, error);
        res.status(500).json({ message: "Error fetching program landing page." });
    }
};

exports.getProgramContent = async (req, res) => {
    try {
        const { programId } = req.params;
        
        const programForCheck = await Program.findById(programId).select('coach').lean();
        if (!programForCheck) {
            return res.status(404).json({ message: 'Program not found.' });
        }

        const isOwner = programForCheck.coach.equals(req.user._id);
        const isEnrolled = await Enrollment.findOne({ user: req.user._id, program: programId });

        if (!isEnrolled && !isOwner) {
            return res.status(403).json({ message: 'Access denied. You are not enrolled in this program.' });
        }

        const program = await Program.findById(programId)
            .populate('coach', '_id')
            .populate({
                path: 'modules',
                populate: { path: 'lessons' }
            }).lean();

        if (!program) return res.status(404).json({ message: 'Program not found.' });
        
        await enrichFilesWithSignedUrls(program);

        res.status(200).json(program);
    } catch (error) {
         logger.error('Error fetching program content', { error: error.message, stack: error.stack, programId: req.params.programId });
         res.status(500).json({ message: "Error fetching program content." });
    }
};

exports.enrollInProgram = async (req, res) => {
    console.log('[programController.enrollInProgram] 1. START: Received enrollment request.', { programId: req.params.programId, userId: req.user?._id, body: req.body });
    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();
    try {
        const { programId } = req.params;
        const { discountCode } = req.body;
        const userId = req.user._id;

        const program = await Program.findById(programId).populate('coach').session(dbSession);
        if (!program || program.status !== 'published') {
            await dbSession.abortTransaction();
            dbSession.endSession();
            console.error('[programController.enrollInProgram] 2. FAIL: Program not found or not published.');
            return res.status(400).json({ success: false, message: "Program not found or not available for purchase." });
        }
        
        // --- START FIX ---
        // 1. Explicitly fetch the Coach document to get Stripe details and ensure user reference is solid.
        const coachDoc = await Coach.findOne({ user: program.coach._id }).session(dbSession);
        if (!coachDoc || !coachDoc.settings?.paymentAndBilling?.stripe?.accountId) {
            await dbSession.abortTransaction();
            dbSession.endSession();
            console.error('[programController.enrollInProgram] 2. FAIL: Coach payment information is not configured.', { coachUserId: program.coach._id });
            return res.status(400).json({ success: false, message: "This program cannot be purchased as the coach's payment account is not configured." });
        }
        const coachStripeAccountId = coachDoc.settings.paymentAndBilling.stripe.accountId;
        // --- END FIX ---

        logger.debug("[DIAGNOSTIC LOG] Data check before Payment record creation", {
            coachIdFromProgram: program.coach._id,
            coachIdFromCoachDoc: coachDoc.user,
            coachStripeAccountId: coachStripeAccountId,
            isCoachIdMatch: program.coach._id.toString() === coachDoc.user.toString()
        });
        
        const existingEnrollment = await Enrollment.findOne({ user: userId, program: programId }).session(dbSession);
        if (existingEnrollment && ['active', 'completed'].includes(existingEnrollment.status)) {
            await dbSession.abortTransaction();
            dbSession.endSession();
            console.warn('[programController.enrollInProgram] 2. FAIL: User already enrolled.');
            return res.status(400).json({ success: false, message: "You are already enrolled in this program." });
        }
        
        console.log('[programController.enrollInProgram] 2. Checks passed. Calculating price...');
        const priceDetails = await PricingService.calculateProgramPrice({
            programId,
            coachId: program.coach._id,
            userId,
            discountCode
        });
        console.log('[programController.enrollInProgram] 3. Price calculation complete.', { finalAmount: priceDetails.final.amount.amount });
        
        const finalAmount = priceDetails.final.amount.amount;
        const currency = priceDetails.currency;
        
        if (finalAmount <= 0) {
            // ... (The free enrollment logic remains unchanged) ...
            const enrollmentToUpdate = existingEnrollment || new Enrollment({
                user: userId,
                program: programId,
                progress: { totalLessons: program.totalLessons || 0 },
            });
            
            enrollmentToUpdate.set({
                payment: null,
                status: 'active'
            });

            await enrollmentToUpdate.save({ session: dbSession });

            if (!existingEnrollment) {
                 await Program.updateOne({ _id: programId }, { $inc: { enrollmentsCount: 1 } }, { session: dbSession });
            }
            
            const appliedDiscountDetails = priceDetails?._calculationDetails?.appliedDiscount;
            if (appliedDiscountDetails && appliedDiscountDetails._id && userId) {
                const discountDoc = await Discount.findById(appliedDiscountDetails._id).session(dbSession);
                if (discountDoc) {
                    if (discountDoc.limitToOnePerCustomer) {
                        const usage = await DiscountUsage.findOneAndUpdate(
                            { discount: discountDoc._id, user: userId },
                            { $setOnInsert: { discount: discountDoc._id, user: userId } },
                            { upsert: true, new: true, session: dbSession }
                        );
                    }
                    await Discount.updateOne({ _id: discountDoc._id }, { $inc: { timesUsed: 1 } }).session(dbSession);
                }
            }

            unifiedNotificationService.sendNotification({
                type: NotificationTypes.PROGRAM_PURCHASE_CONFIRMED,
                recipient: userId,
                metadata: {
                    programId: programId,
                    programTitle: program.title,
                    coachName: `${program.coach.firstName} ${program.coach.lastName}`,
                }
            });
            
            console.log('[programController.enrollInProgram] 4. Processed as FREE enrollment. Committing transaction.');
            await dbSession.commitTransaction();
            dbSession.endSession();
            
            return res.status(200).json({ success: true, message: "Successfully enrolled in free program." });
        }

       console.log('[programController.enrollInProgram] 4. Processing as PAID enrollment. Creating Payment record...');

       logger.debug("[DIAGNOSTIC LOG] Values being passed to new Payment() constructor", {
            programId: programId,
            payerId: userId,
            recipientId: coachDoc.user._id,
            recipientIdType: typeof coachDoc.user
        });

        const newPayment = new Payment({
            program: programId,
            payer: userId,
            recipient: coachDoc.user._id,
            coachStripeAccountId: coachStripeAccountId,
            type: 'program_purchase',
            amount: {
                base: priceDetails.base.amount.amount,
                platformFee: priceDetails.platformFee.amount,
                vat: priceDetails.vat,
                total: finalAmount,
                currency: currency
            },
            status: 'draft', 
            priceSnapshot: priceDetails,
            discountApplied: priceDetails._calculationDetails.appliedDiscount || undefined,
        });
        await newPayment.save({ session: dbSession });
        console.log('[programController.enrollInProgram] 5. Payment record created in draft state.', { paymentId: newPayment._id });

       console.log('[programController.enrollInProgram] 6. Calling paymentService.createPaymentIntent...');
       const paymentIntent = await paymentService.createPaymentIntent({
            bookingId: newPayment._id.toString(), 
            priceDetails: priceDetails,
            currency: currency,
            userId: userId,
            coachStripeAccountId: coachStripeAccountId,
            metadata: {
                type: 'program_purchase',
                programId: programId.toString(),
                userId: userId.toString(),
                coachId: program.coach._id.toString(),
                paymentId: newPayment._id.toString()
            }
        });
        
        if (!paymentIntent) {
            await dbSession.abortTransaction();
            dbSession.endSession();
            console.error('[programController.enrollInProgram] 7. FAIL: createPaymentIntent returned null. Aborting.');
            return res.status(500).json({ success: false, message: "Could not initialize payment." });
        }
        console.log('[programController.enrollInProgram] 7. Payment Intent created successfully by service.', { paymentIntentId: paymentIntent.id });
        
        newPayment.status = 'pending';
        newPayment.stripe = {
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            customerId: paymentIntent.customer
        };
        await newPayment.save({ session: dbSession });
        
        console.log('[programController.enrollInProgram] 8. Creating/updating Enrollment record...');
        const enrollmentToUpdate = existingEnrollment || new Enrollment({
            user: userId,
            program: programId,
            progress: {
                totalLessons: program.totalLessons || 0,
                completedLessons: [],
                lessonDetails: []
            }
        });
        
        enrollmentToUpdate.set({
            status: 'pending_payment',
            payment: newPayment._id
        });
        await enrollmentToUpdate.save({ session: dbSession });
        
        const appliedDiscountDetails = priceDetails?._calculationDetails?.appliedDiscount;
        if (appliedDiscountDetails && appliedDiscountDetails._id && userId) {
            const discountDoc = await Discount.findById(appliedDiscountDetails._id).session(dbSession);
            if (discountDoc) {
                if (discountDoc.limitToOnePerCustomer) {
                     await DiscountUsage.findOneAndUpdate(
                        { discount: discountDoc._id, user: userId },
                        { $setOnInsert: { discount: discountDoc._id, user: userId } },
                        { upsert: true, new: true, session: dbSession }
                    );
                }
                await Discount.updateOne({ _id: discountDoc._id }, { $inc: { timesUsed: 1 } }).session(dbSession);
            }
        }
        
        console.log('[programController.enrollInProgram] 9. Committing transaction...');
        await dbSession.commitTransaction();
        dbSession.endSession();
        
        console.log('[programController.enrollInProgram] 10. SUCCESS: Transaction committed. Sending response to client.');
        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentId: newPayment._id.toString(),
            programId: programId,
            paymentIntent: {
                id: paymentIntent.id,
                amount: paymentIntent.amount,
                currency: currency.toLowerCase()
            }
        });

    } catch (error) {
        if (dbSession.inTransaction()) {
            await dbSession.abortTransaction();
        }
        dbSession.endSession();
        console.error('[programController.enrollInProgram] X. CATCH BLOCK: An error occurred during enrollment.', { errorMessage: error.message, stack: error.stack });
        res.status(500).json({ success: false, message: 'Error initiating enrollment.', error: error.message });
    }
};

exports.getUserEnrollments = async (req, res) => {
    try {
        const enrollments = await Enrollment.find({ user: req.user._id })
            .populate({
                path: 'program',
                select: 'title coverImage coach',
                populate: {
                    path: 'coach',
                    select: 'firstName lastName'
                }
            });
        res.status(200).json(enrollments);
    } catch (error) {
        res.status(500).json({ message: "Error fetching user enrollments." });
    }
};

exports.updateUserProgress = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    const { enrollmentId } = req.params;
    const { lessonId, fileId } = req.body;
    
    console.log(`[CONTROLLER_TRACE] 1. ENTERING 'updateUserProgress'.`);
    console.log(`   - Enrollment ID: ${enrollmentId}, Lesson ID: ${lessonId}, File ID: ${fileId}`);

    try {
        const userId = req.user._id;
        const enrollment = await Enrollment.findOne({ _id: enrollmentId, user: userId }).session(session);

        if (!enrollment) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: "Enrollment not found or access denied." });
        }
        
        console.log(`[CONTROLLER_TRACE] 2. Found enrollment.`);

        const lesson = await Lesson.findById(lessonId).select('content.files').lean();
        if (!lesson) {
             await session.abortTransaction(); session.endSession();
             return res.status(404).json({ message: "Lesson not found." });
        }
        
        if (fileId) {
            const fileExists = lesson.content?.files?.some(f => f.publicId === fileId);
            if (!fileExists) {
                logger.error(`[CONTROLLER_TRACE] Invalid fileId '${fileId}' for lesson '${lessonId}'. Not found in lesson.content.files. Aborting.`);
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ message: `Invalid file identifier provided for this lesson.` });
            }
        }
        
        const totalFiles = lesson.content?.files?.length || 0;
        console.log(`[CONTROLLER_TRACE] 3. Found lesson. Total files in lesson: ${totalFiles}`);

        let lessonDetailIndex = enrollment.progress.lessonDetails.findIndex(ld => ld.lesson.equals(lessonId));
        
        if (lessonDetailIndex === -1) {
            enrollment.progress.lessonDetails.push({ lesson: lessonId, status: 'in_progress', attempts: 0, completedFileIds: [] });
            lessonDetailIndex = enrollment.progress.lessonDetails.length - 1;
            console.log(`[CONTROLLER_TRACE] 4a. Created new lessonDetail for this lesson.`);
        } else {
            console.log(`[CONTROLLER_TRACE] 4b. Found existing lessonDetail.`);
        }
        
        const lessonDetail = enrollment.progress.lessonDetails[lessonDetailIndex];
        
        console.log(`[CONTROLLER_TRACE] 5. Before update, completedFileIds: [${(lessonDetail.completedFileIds || []).join(', ')}]`);

        if (fileId) {
            if (!lessonDetail.completedFileIds.includes(fileId)) {
                lessonDetail.completedFileIds.push(fileId);
                 console.log(`[CONTROLLER_TRACE] 6a. Pushed new fileId '${fileId}' to completedFileIds.`);
            } else {
                 console.log(`[CONTROLLER_TRACE] 6b. Skipped pushing fileId '${fileId}' as it already exists.`);
            }
        }
        
        console.log(`[CONTROLLER_TRACE] 7. After update, completedFileIds: [${(lessonDetail.completedFileIds || []).join(', ')}]`);
        
        const isLessonNowComplete = !fileId || (totalFiles > 0 && lessonDetail.completedFileIds.length >= totalFiles);

        console.log(`[CONTROLLER_TRACE] 8. Checking if lesson is complete. !fileId: ${!fileId}, totalFiles: ${totalFiles}, completedCount: ${lessonDetail.completedFileIds.length}, isLessonNowComplete: ${isLessonNowComplete}`);

        if (isLessonNowComplete) {
            lessonDetail.status = 'completed';
            const completedSet = new Set(enrollment.progress.completedLessons.map(id => id.toString()));
            if (!completedSet.has(lessonId.toString())) {
                enrollment.progress.completedLessons = [...enrollment.progress.completedLessons, lessonId];
                console.log(`[CONTROLLER_TRACE] 9a. Lesson is now complete. Updated completedLessons array.`);
            } else {
                 console.log(`[CONTROLLER_TRACE] 9b. Lesson is complete, but was already in completedLessons array.`);
            }
        }

        enrollment.progress.lastViewedLesson = lessonId;

        
       if (enrollment.status !== 'completed' && enrollment.progress.completedLessons.length === enrollment.progress.totalLessons && enrollment.progress.totalLessons > 0) {
            enrollment.status = 'completed';
            console.log(`[CONTROLLER_TRACE] 10. Program is now complete.`);

            const program = await Program.findById(enrollment.program).select('title').lean();
            if (program) {
                unifiedNotificationService.sendNotification({
                    type: NotificationTypes.PROGRAM_COMPLETED,
                    recipient: userId,
                    metadata: {
                        programId: enrollment.program,
                        programTitle: program.title,
                    }
                });
            }
        }
        
        enrollment.markModified('progress');
        const updatedEnrollment = await enrollment.save({ session });
        
        await session.commitTransaction();
        session.endSession();

        console.log(`[CONTROLLER_TRACE] 11. Transaction committed. Sending updated enrollment.`);
        res.status(200).json(updatedEnrollment);

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('[CONTROLLER_TRACE] X. FATAL ERROR in updateUserProgress', { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error updating progress.", error: error.message });
    }
};

exports.getProgramCategories = async (req, res) => {
    try {
        const language = req.user.preferredLanguage || 'en';
        const { query } = req.query;

        const categories = await ProgramCategory.find().sort({ name: 1 }).lean();

        const categoryIds = categories.map(cat => cat._id.toString());
        const translationKeys = categoryIds.map(id => `program_categories_${id}`);

        const translations = await Translation.find({
            key: { $in: translationKeys },
            [`translations.name.${language}`]: { $exists: true, $ne: null, $ne: '' }
        }).lean();

        const translationMap = new Map();
        translations.forEach(t => {
            const itemId = t.key.split('_').pop();
            if (t.translations.name && t.translations.name[language]) {
                translationMap.set(itemId, t.translations.name[language]);
            }
        });

        let enrichedCategories = categories.map(cat => {
            const itemId = cat._id.toString();
            return {
                ...cat,
                translation: translationMap.get(itemId) || null
            };
        });

        if (query) {
            const regex = new RegExp(query, 'i');
            enrichedCategories = enrichedCategories.filter(cat => regex.test(cat.name) || (cat.translation && regex.test(cat.translation)));
        }

        res.status(200).json(enrichedCategories);
    } catch(error) {
        res.status(500).json({ message: 'Error fetching categories.' });
    }
};

exports.getUniqueLearningOutcomes = async (req, res) => {
    console.log(`[DEBUG] 1. ENTERING 'getUniqueLearningOutcomes' with query:`, req.query);
    try {
        const { query } = req.query;
        const pipeline = [
            { $match: { status: 'published', learningOutcomes: { $exists: true, $ne: null, $ne: [] } } },
            { $unwind: '$learningOutcomes' },
            { $match: { learningOutcomes: { $ne: "" } } },
            { $group: { _id: '$learningOutcomes' } },
        ];

        if (query) {
            pipeline.push({
                $match: {
                    _id: { $regex: query, $options: 'i' }
                }
            });
        }
        
        pipeline.push({ $sort: { _id: 1 } });
        console.log(`[DEBUG] 2. Constructed Aggregation Pipeline:`, JSON.stringify(pipeline, null, 2));

        const outcomes = await Program.aggregate(pipeline);
        console.log(`[DEBUG] 3. Aggregation result (outcomes):`, outcomes);

        const formattedOutcomes = outcomes.map(outcome => ({
            _id: outcome._id,
            name: outcome._id,
            translation: null
        }));
        console.log(`[DEBUG] 4. Formatted outcomes to be sent to client (first 5):`, formattedOutcomes.slice(0, 5));

        res.status(200).json(formattedOutcomes);
    } catch (error) {
        console.error(`[DEBUG] X. CATCH BLOCK in 'getUniqueLearningOutcomes'. Error:`, error);
        logger.error('Error fetching unique learning outcomes', { 
            errorMessage: error.message, 
            errorStack: error.stack,
            errorName: error.name,
            query: req.query
        });
        res.status(500).json({ message: 'Error fetching learning outcomes.' });
    }
};

exports.getProgramAuthors = async (req, res) => {
    try {
        const { query } = req.query;

        // 1. Find all distinct coach IDs from published programs
        const distinctCoachIds = await Program.distinct('coach', { status: 'published' });

        // 2. Build the query to find these coaches (who are Users)
        const authorQuery = {
            _id: { $in: distinctCoachIds }
        };

        // 3. If a search query is provided, filter by name
        if (query) {
            const regex = new RegExp(query, 'i');
            authorQuery.$or = [
                { firstName: regex },
                { lastName: regex },
            ];
        }
        
        // 4. Execute the query
        const authors = await User.find(authorQuery)
            .select('firstName lastName')
            .lean();

        // 5. Format the data for the frontend selector
        const formattedAuthors = authors.map(author => ({
            _id: author._id,
            name: `${author.firstName} ${author.lastName}`
        }));
        
        // 6. Sort alphabetically
        formattedAuthors.sort((a, b) => a.name.localeCompare(b.name));

        res.status(200).json(formattedAuthors);
    } catch (error) {
        logger.error('Error fetching program authors', {
            errorMessage: error.message,
            errorStack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error fetching program authors.' });
    }
};

exports.getComments = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const lesson = await Lesson.findById(lessonId).select('program').lean();
        if (!lesson) {
            return res.status(404).json({ message: 'Lesson not found.' });
        }
        const program = await Program.findById(lesson.program).select('isDiscussionEnabled').lean();
        if (!program.isDiscussionEnabled) {
            return res.status(403).json({ message: 'Q&A is not enabled for this program.' });
        }
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const comments = await Comment.find({ lesson: lessonId, parentComment: null })
            .populate({
                path: 'user',
                select: 'firstName lastName profilePicture role'
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const userIds = new Set();

        const fetchRepliesRecursively = async (commentList) => {
            for (let comment of commentList) {
                if (comment.user) {
                    userIds.add(comment.user._id.toString());
                }

                const replies = await Comment.find({ parentComment: comment._id })
                    .populate({
                        path: 'user',
                        select: 'firstName lastName profilePicture role'
                    })
                    .sort({ createdAt: 1 })
                    .lean();

                if (replies.length > 0) {
                    comment.replies = replies;
                    await fetchRepliesRecursively(comment.replies);
                }
            }
        };

        await fetchRepliesRecursively(comments);
        
        const coaches = await Coach.find({ user: { $in: Array.from(userIds) } }).select('user profilePicture').lean();
        const coachPictureMap = new Map(coaches.map(c => [c.user.toString(), c.profilePicture]));

        const enrichCommentsRecursively = (commentList) => {
            for (let comment of commentList) {
                if (comment.user && comment.user.role === 'coach') {
                    const coachPic = coachPictureMap.get(comment.user._id.toString());
                    if (coachPic) {
                        comment.user.coachProfilePicture = coachPic;
                    }
                }
                if (comment.replies && comment.replies.length > 0) {
                    enrichCommentsRecursively(comment.replies);
                }
            }
        };
        
        enrichCommentsRecursively(comments);

        const totalComments = await Comment.countDocuments({ lesson: lessonId, parentComment: null });

        res.status(200).json({
            docs: comments,
            totalDocs: totalComments,
            limit,
            page,
            totalPages: Math.ceil(totalComments / limit),
            hasNextPage: page < Math.ceil(totalComments / limit),
        });
    } catch (error) {
        logger.error('Error fetching comments', { error: error.message, stack: error.stack, lessonId: req.params.lessonId });
        res.status(500).json({ message: 'Error fetching comments.' });
    }
};

exports.postComment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { lessonId } = req.params;
        const { content, parentComment: parentCommentId } = req.body;
        const userId = req.user._id;

        const lesson = await Lesson.findById(lessonId).select('program').session(session);
        if (!lesson) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Lesson not found.' });
        }
        const program = await Program.findById(lesson.program).select('isDiscussionEnabled coach title').session(session);
        if (!program.isDiscussionEnabled) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Q&A is not enabled for this program.' });
        }

        const isCoachOfProgram = program.coach.equals(userId);
        const isEnrolled = await isUserEnrolledInLessonProgram(lessonId, userId);

        if (!isEnrolled && !isCoachOfProgram) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'You must be enrolled or be the coach to comment.' });
        }

        const newComment = new Comment({
            lesson: lessonId,
            user: userId,
            content,
            parentComment: parentCommentId || null
        });

        await newComment.save({ session });
        
        await newComment.populate({
            path: 'user',
            select: 'firstName lastName profilePicture role'
        });

        await newComment.populate({
            path: 'lesson',
            select: 'title program',
            populate: { path: 'program', select: 'coach title' }
        });
        
        if (parentCommentId) {
            const parentComment = await Comment.findById(parentCommentId).session(session);
            if (parentComment && !parentComment.user.equals(userId)) {
                unifiedNotificationService.sendNotification({
                    type: NotificationTypes.PROGRAM_COMMENT_REPLY,
                    recipient: parentComment.user,
                    sender: userId,
                    metadata: {
                        programId: program._id,
                        lessonId: lessonId,
                        commentId: newComment._id,
                        programTitle: program.title,
                        lessonTitle: newComment.lesson.title,
                        commenterName: `${req.user.firstName} ${req.user.lastName}`
                    }
                });
            }
        } else {
             if (!program.coach.equals(userId)) {
                unifiedNotificationService.sendNotification({
                    type: NotificationTypes.PROGRAM_COMMENT_POSTED,
                    recipient: program.coach,
                    sender: userId,
                     metadata: {
                        programId: program._id,
                        lessonId: lessonId,
                        commentId: newComment._id,
                        programTitle: program.title,
                        lessonTitle: newComment.lesson.title,
                        commenterName: `${req.user.firstName} ${req.user.lastName}`
                    }
                });
            }
        }

        await session.commitTransaction();
        session.endSession();

        const responseComment = newComment.toObject();

        if (responseComment.user && responseComment.user.role === 'coach') {
            const coachProfile = await Coach.findOne({ user: responseComment.user._id }).select('profilePicture').lean();
            if (coachProfile) {
                responseComment.user.coachProfilePicture = coachProfile.profilePicture;
            }
        }
        
        delete responseComment.lesson;

        res.status(201).json(responseComment);
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error posting comment', { error: error.message, stack: error.stack, lessonId: req.params.lessonId });
        res.status(500).json({ message: 'Error posting comment.' });
    }
};

exports.updateLesson = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const lesson = await Lesson.findById(lessonId);
        if (!lesson) {
            return res.status(404).json({ message: 'Lesson not found.' });
        }

        if (!await isProgramCoach(lesson.program, req.user._id)) {
            return res.status(403).json({ message: 'Forbidden.' });
        }
        
        const updatedLesson = await Lesson.findByIdAndUpdate(lessonId, { $set: req.body }, { new: true });
        res.status(200).json(updatedLesson);
    } catch (error) {
        logger.error('Error updating lesson', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating lesson', error: error.message });
    }
};

exports.updateModule = async (req, res) => {
    try {
        const { moduleId } = req.params;
        const module = await Module.findById(moduleId);
        if (!module) {
            return res.status(404).json({ message: 'Module not found.' });
        }

        if (!await isProgramCoach(module.program, req.user._id)) {
            return res.status(403).json({ message: 'Forbidden.' });
        }
        
        const updatedModule = await Module.findByIdAndUpdate(moduleId, { $set: req.body }, { new: true });
        res.status(200).json(updatedModule);
    } catch (error) {
        logger.error('Error updating module', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating module', error: error.message });
    }
};

exports.deleteModule = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { programId, moduleId } = req.params;

        if (!await isProgramCoach(programId, req.user._id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden.' });
        }

        const moduleToDelete = await Module.findById(moduleId).session(session);
        if (!moduleToDelete) {
             await session.abortTransaction();
             session.endSession();
            return res.status(404).json({ message: 'Module not found.' });
        }
        
        const publicIdsToDelete = [];
        const videoIdsToDelete = [];
        const lessonsInModule = await Lesson.find({ _id: { $in: moduleToDelete.lessons } }).select('content').session(session);
        for (const lesson of lessonsInModule) {
            if (lesson.content?.presentation?.slides?.length > 0) {
                lesson.content.presentation.slides.forEach(slide => {
                    if (slide.imagePublicId) publicIdsToDelete.push(slide.imagePublicId);
                    if (slide.audioPublicId) videoIdsToDelete.push(slide.audioPublicId);
                });
            }
            if (lesson.content?.files?.length > 0) {
                lesson.content.files.forEach(file => {
                    if (file.publicId) {
                        if (file.resourceType === 'video') videoIdsToDelete.push(file.publicId);
                        else publicIdsToDelete.push(file.publicId);
                    }
                });
            }
        }

        await Lesson.deleteMany({ _id: { $in: moduleToDelete.lessons } }).session(session);
        await Module.findByIdAndDelete(moduleId).session(session);
        await Program.findByIdAndUpdate(programId, { $pull: { modules: moduleId } }, { session });
        await session.commitTransaction();
        session.endSession();
        
       assetCleanupService.queueAssetDeletion(publicIdsToDelete, 'image');
        assetCleanupService.queueAssetDeletion(videoIdsToDelete, 'video');

        const program = await Program.findById(programId)
            .populate({ path: 'modules', populate: { path: 'lessons' } })
            .populate('category')
            .lean();

        const enrichedProgram = await enrichProgramWithCategoryTranslation(program, req.user.preferredLanguage || 'en');
        res.status(200).json(enrichedProgram);

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error deleting module', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting module', error: error.message });
    }
};

exports.deleteLesson = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { moduleId, lessonId } = req.params;
        const lessonToDelete = await Lesson.findById(lessonId).session(session);

        if (!lessonToDelete) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Lesson not found.' });
        }
        
        if (!await isProgramCoach(lessonToDelete.program, req.user._id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden.' });
        }
        
        const publicIdsToDelete = [];
        const videoIdsToDelete = [];
        if (lessonToDelete.content?.presentation?.slides?.length > 0) {
            lessonToDelete.content.presentation.slides.forEach(slide => {
                if (slide.imagePublicId) publicIdsToDelete.push(slide.imagePublicId);
                if (slide.audioPublicId) videoIdsToDelete.push(slide.audioPublicId);
            });
        }
        if (lessonToDelete.content?.files?.length > 0) {
            lessonToDelete.content.files.forEach(file => {
                if (file.publicId) {
                    if (file.resourceType === 'video') videoIdsToDelete.push(file.publicId);
                    else publicIdsToDelete.push(file.publicId);
                }
            });
        }

        await Lesson.findByIdAndDelete(lessonId).session(session);
        await Module.findByIdAndUpdate(moduleId, { $pull: { lessons: lessonId } }).session(session);
        await Program.findByIdAndUpdate(lessonToDelete.program, { $inc: { totalLessons: -1 } }).session(session);
        await session.commitTransaction();
        session.endSession();
        
        console.log(`[assetCleanup] deleteLesson: Triggering cleanup for lesson ${lessonId}. Images to delete: ${publicIdsToDelete.length}, Videos to delete: ${videoIdsToDelete.length}.`);
        if (publicIdsToDelete.length > 0) console.log(`[assetCleanup] deleteLesson: Image Public IDs:`, publicIdsToDelete);
        if (videoIdsToDelete.length > 0) console.log(`[assetCleanup] deleteLesson: Video Public IDs:`, videoIdsToDelete);

        assetCleanupService.queueAssetDeletion(publicIdsToDelete, 'image');
        assetCleanupService.queueAssetDeletion(videoIdsToDelete, 'video');

        Program.recalculateAndSaveDerivedData(lessonToDelete.program)
          .catch(err => logger.error('Failed to run background derived data calculation after lesson deletion.', { programId: lessonToDelete.program, err }));

        const program = await Program.findById(lessonToDelete.program)
            .populate({ path: 'modules', populate: { path: 'lessons' } })
            .populate('category')
            .lean();

        const enrichedProgram = await enrichProgramWithCategoryTranslation(program, req.user.preferredLanguage || 'en');
        res.status(200).json(enrichedProgram);

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error deleting lesson', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting lesson', error: error.message });
    }
};

exports.deleteProgram = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { programId } = req.params;
        const program = await Program.findById(programId).session(session);

        if (!program) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Program not found.' });
        }
        if (!program.coach.equals(req.user._id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden: You are not the coach of this program.' });
        }

        const publicIdsToDelete = [];
        const videoIdsToDelete = [];

        if (program.programImages?.length > 0) {
            program.programImages.forEach(img => img.publicId && publicIdsToDelete.push(img.publicId));
        }
        if (program.trailerVideo?.publicId) {
            videoIdsToDelete.push(program.trailerVideo.publicId);
        }

        const lessons = await Lesson.find({ program: programId }).select('content').session(session);
        for (const lesson of lessons) {
            if (lesson.content?.presentation?.slides?.length > 0) {
                lesson.content.presentation.slides.forEach(slide => {
                    if (slide.imagePublicId) publicIdsToDelete.push(slide.imagePublicId);
                    if (slide.audioPublicId) videoIdsToDelete.push(slide.audioPublicId);
                });
            }
            if (lesson.content?.files?.length > 0) {
                lesson.content.files.forEach(file => {
                    if (file.publicId) {
                        if (file.resourceType === 'video') {
                            videoIdsToDelete.push(file.publicId);
                        } else {
                            publicIdsToDelete.push(file.publicId);
                        }
                    }
                });
            }
        }
        
        const modules = await Module.find({ program: programId }).session(session);
        const moduleIds = modules.map(m => m._id);
        await Lesson.deleteMany({ module: { $in: moduleIds } }).session(session);
        await Module.deleteMany({ program: programId }).session(session);
        await Enrollment.deleteMany({ program: programId }).session(session);
        await Program.deleteOne({ _id: programId }).session(session);

        await session.commitTransaction();
        session.endSession();
        
        assetCleanupService.queueAssetDeletion(publicIdsToDelete, 'image');
        assetCleanupService.queueAssetDeletion(videoIdsToDelete, 'video');

        res.status(200).json({ message: 'Program deleted successfully.' });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error deleting program', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting program', error: error.message });
    }
};

exports.updateComment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        const comment = await Comment.findById(commentId).session(session);
        if (!comment) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Comment not found.' });
        }

        // A user can only update their own comment
        if (!comment.user.equals(userId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden. You can only edit your own comments.' });
        }
        
        comment.content = content;
        await comment.save({ session });
        
        await comment.populate({
            path: 'user',
            select: 'firstName lastName profilePicture'
        });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json(comment);

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error updating comment', { error: error.message, stack: error.stack, commentId: req.params.commentId });
        res.status(500).json({ message: 'Error updating comment.' });
    }
};

exports.deleteComment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { commentId } = req.params;
        const userId = req.user._id;

        const comment = await Comment.findById(commentId).populate('lesson').session(session);
        if (!comment) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Comment not found.' });
        }
        
        const program = await Program.findById(comment.lesson.program).select('coach').lean();

        // Allow deletion if the user is the comment author OR the program coach
        const isAuthor = comment.user.equals(userId);
        const isCoachOfProgram = program && program.coach.equals(userId);

        if (!isAuthor && !isCoachOfProgram) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden. You do not have permission to delete this comment.' });
        }

        // If it's a parent comment, delete all its replies as well
        if (!comment.parentComment) {
            await Comment.deleteMany({ parentComment: commentId }).session(session);
        }

        await Comment.findByIdAndDelete(commentId).session(session);
        
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: 'Comment deleted successfully.' });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error deleting comment', { error: error.message, stack: error.stack, commentId: req.params.commentId });
        res.status(500).json({ message: 'Error deleting comment.' });
    }
};

exports.submitLesson = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    const { enrollmentId, lessonId } = req.params;
      console.log(`[CONTROLLER_TRACE] 1. ENTERING 'submitLesson' for complex lessons.`);
    console.log(`   - Enrollment ID: ${enrollmentId}`);
    console.log(`   - Lesson ID: ${lessonId}`);
    console.log('[submitLesson] Starting lesson submission.', { enrollmentId, lessonId, body: req.body });

    try {
        const userId = req.user._id;

        const enrollment = await Enrollment.findById(enrollmentId).session(session);
        if (!enrollment || !enrollment.user.equals(userId)) {
            await session.abortTransaction(); session.endSession();
            logger.warn('[submitLesson] Enrollment not found or user mismatch.', { enrollmentId });
            return res.status(404).json({ message: "Enrollment not found or access denied." });
        }

        const lesson = await Lesson.findById(lessonId).session(session);
        if (!lesson) {
            await session.abortTransaction(); session.endSession();
            logger.warn('[submitLesson] Lesson not found.', { lessonId });
            return res.status(404).json({ message: "Lesson not found." });
        }
        
        const program = await Program.findById(lesson.program).select('coach title').lean();
         console.log(`[CONTROLLER_TRACE] 2. FOUND ENROLLMENT & LESSON. Lesson type: ${lesson.contentType}`);
        console.log(`   - State BEFORE update. Completed Lessons Array: [${enrollment.progress.completedLessons.map(l => l.toString()).join(', ')}]`);
        console.log(`[submitLesson] Processing submission for lesson type: ${lesson.contentType}`);

        let lessonProgressIndex = enrollment.progress.lessonDetails.findIndex(ld => ld.lesson.equals(lessonId));

         if (lessonProgressIndex === -1) {
            console.log(`[CONTROLLER_TRACE] 3a. LOGIC: Lesson not in details. Adding new lesson detail.`);
            enrollment.progress.lessonDetails.push({ lesson: lessonId, attempts: 0, status: 'in_progress' });
            lessonProgressIndex = enrollment.progress.lessonDetails.length - 1;
        } else {
             console.log(`[CONTROLLER_TRACE] 3b. LOGIC: Lesson already in details. Updating.`);
        }

        const lessonProgress = enrollment.progress.lessonDetails[lessonProgressIndex];
        lessonProgress.attempts = (lessonProgress.attempts || 0) + 1;

        let submissionResult = { success: false, passed: false };
        let notificationType = null;
        let oldFilePublicIdToDelete = null;

        if (lesson.contentType === 'quiz') {
               console.log(`[CONTROLLER_TRACE] 4. COMPLETION LOGIC for type 'quiz'.`);
            // ... (Quiz logic remains the same)
        } else if (lesson.contentType === 'assignment') {
             console.log(`[CONTROLLER_TRACE] 4. COMPLETION LOGIC for type 'assignment'.`);
    const { textSubmission } = req.body;
    const assignmentDetails = lesson.content.assignment;
    
    const submissionData = lessonProgress.submission || { submittedAt: new Date() };
    submissionData.submittedAt = new Date();

     if (assignmentDetails.submissionType === 'file_upload') {
        if (req.files && req.files.submissionFile) {
            const files = Array.isArray(req.files.submissionFile) ? req.files.submissionFile : [req.files.submissionFile];
            
            const uploadedFiles = await Promise.all(files.map(async (file) => {
                console.log('[SUBMISSION_UPLOAD_TRACE] 1. Uploading file to Cloudinary:', { name: file.name, type: file.mimetype });
                const result = await cloudinary.uploader.upload(file.tempFilePath, {
                    folder: `assignments/${enrollment.user}/${enrollment.program}/${lessonId}`,
                    resource_type: "auto",
                    type: "private",
                    upload_preset: "assignment_submissions"
                });
                console.log('[SUBMISSION_UPLOAD_TRACE] 2. Received response from Cloudinary:', result);
                const fileDataToSave = {
                    url: result.secure_url,
                    publicId: result.public_id,
                    name: file.name,
                    type: file.mimetype,
                    size: result.bytes,
                    resource_type: result.resource_type
                };
                console.log('[SUBMISSION_UPLOAD_TRACE] 3. File data object prepared for DB save:', fileDataToSave);
                return fileDataToSave;
            }));

            if (!submissionData.files) {
                submissionData.files = [];
            }
            submissionData.files.push(...uploadedFiles);
            submissionData.text = undefined;
        }  else if (!lessonProgress.submission?.files?.length && !submissionData.files?.length) {
                await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "File submission is required for this assignment." });
        }
    } else { // 'text' submission type
            if (typeof textSubmission === 'string') {
            submissionData.text = textSubmission;
            // When submitting text, we clear any previous files.
            // Deletion from Cloudinary should be handled separately if needed,
            // for now we just clear the DB reference.
            if (submissionData.files?.length > 0) {
                 const publicIdsToDelete = submissionData.files.map(f => f.publicId);
                 // Defer deletion to after transaction commits
                 // For now, just clear the array in the DB
            }
            submissionData.files = [];
        } else if (!lessonProgress.submission?.text && !textSubmission) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ message: "Text submission is required for this assignment." });
        }
    }
    
    lessonProgress.status = 'submitted';
    lessonProgress.submission = submissionData;
    
    enrollment.progress.completedLessons.addToSet(lessonId);
    submissionResult = { success: true, passed: true };
    notificationType = NotificationTypes.PROGRAM_ASSIGNMENT_SUBMITTED;
} else if (lesson.contentType === 'presentation') {
            console.log(`[CONTROLLER_TRACE] 4. COMPLETION LOGIC for type 'presentation'.`);
            lessonProgress.status = 'completed';
            enrollment.progress.completedLessons.addToSet(lessonId);
            submissionResult = { success: true, passed: true };
        }
        enrollment.progress.lastViewedLesson = lessonId;
       if (enrollment.progress.completedLessons.length === enrollment.progress.totalLessons && enrollment.progress.totalLessons > 0) {
            enrollment.status = 'completed';
            if (lessonProgress.status !== 'completed') {
                notificationType = NotificationTypes.PROGRAM_COMPLETED;
            }
             console.log(`[CONTROLLER_TRACE] 5. Program status updated to 'completed'.`);
        }
        
        enrollment.markModified('progress.lessonDetails');
        await enrollment.save({ session });
        
        if (enrollment.status === 'completed' && lessonProgress.status !== 'completed') {
             unifiedNotificationService.sendNotification({
                type: NotificationTypes.PROGRAM_COMPLETED,
                recipient: userId,
                metadata: {
                    programId: lesson.program,
                    programTitle: program.title,
                }
            });
        } else if (notificationType === NotificationTypes.PROGRAM_ASSIGNMENT_SUBMITTED) {
            unifiedNotificationService.sendNotification({
                type: notificationType,
                recipient: program.coach,
                sender: userId,
                metadata: {
                    programId: lesson.program,
                    lessonId: lessonId,
                    programTitle: program.title,
                    lessonTitle: lesson.title,
                    studentName: `${req.user.firstName} ${req.user.lastName}`,
                }
            });
        }
        
        await session.commitTransaction();

        // Delete the old file from Cloudinary after the transaction is successful
        if (oldFilePublicIdToDelete) {
            await cloudinary.uploader.destroy(oldFilePublicIdToDelete);
        }
        
        const populatedEnrollment = await Enrollment.findById(enrollmentId).lean();

         console.log(`[CONTROLLER_TRACE] 6. SUCCESS: Transaction committed. Sending response.`);
        console.log(`   - Final Completed Lessons Array: [${populatedEnrollment.progress.completedLessons.map(l => l.toString()).join(', ')}]`);

        res.status(200).json({ enrollment: populatedEnrollment, result: submissionResult });

     } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        logger.error(`[CONTROLLER_TRACE] 7. FATAL ERROR in submitLesson`, { error: error.message, stack: error.stack, params: req.params });
        res.status(500).json({ message: "Error submitting lesson progress.", error: error.message });
    } finally {
        session.endSession();
    }
};

exports.getAssignmentSubmission = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const userId = req.user._id;

        const lesson = await Lesson.findById(lessonId).select('program contentType content').lean();
        if (!lesson || lesson.contentType !== 'assignment') {
            return res.status(404).json({ message: "Lesson not found or not an assignment." });
        }

        const enrollment = await Enrollment.findOne({ user: userId, program: lesson.program }).lean();
        if (!enrollment) {
            return res.status(200).json(null);
        }

        const lessonProgress = enrollment.progress.lessonDetails.find(ld => ld.lesson.equals(lessonId));

        const hasTextSubmission = lessonProgress?.submission?.text;
        const hasFileSubmission = lessonProgress?.submission?.files?.length > 0;

        if (!lessonProgress || !lessonProgress.submission || (!hasTextSubmission && !hasFileSubmission)) {
            return res.status(200).json(null);
        }

        const submissionType = lesson.content.assignment.submissionType;
        const submission = {
            type: submissionType,
            content: submissionType === 'text' ? lessonProgress.submission.text : (lessonProgress.submission.files || [])
        };

        res.status(200).json(submission);
    } catch (error) {
        logger.error('Error fetching assignment submission', { error: error.message, stack: error.stack, lessonId: req.params.lessonId, userId: req.user._id });
        res.status(500).json({ message: "Error fetching submission." });
    }
};

exports.deleteAssignmentSubmission = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { lessonId } = req.params;
        const userId = req.user._id;

        const lesson = await Lesson.findById(lessonId).select('program contentType').session(session);
        if (!lesson || lesson.contentType !== 'assignment') {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: "Lesson not found or not an assignment." });
        }

        const enrollment = await Enrollment.findOne({ user: userId, program: lesson.program }).session(session);
        if (!enrollment) {
            await session.abortTransaction(); session.endSession();
            return res.status(403).json({ message: "Not enrolled in this program." });
        }

        const lessonProgressIndex = enrollment.progress.lessonDetails.findIndex(ld => ld.lesson.equals(lessonId));
        if (lessonProgressIndex === -1) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: "No submission found." });
        }

        const lessonProgress = enrollment.progress.lessonDetails[lessonProgressIndex];
        const filesToDelete = lessonProgress.submission?.files;
        
        if (filesToDelete && filesToDelete.length > 0) {
            const publicIds = filesToDelete.map(f => f.publicId).filter(Boolean);
            if (publicIds.length > 0) {
                // Deletion from Cloudinary happens outside the transaction
                await Promise.all(publicIds.map(id => cloudinary.uploader.destroy(id)));
            }
        }

        await Enrollment.updateOne(
            { _id: enrollment._id, 'progress.lessonDetails.lesson': lessonId },
            {
                $unset: { 'progress.lessonDetails.$.submission': '' },
                $set: { 'progress.lessonDetails.$.status': 'in_progress' },
                $pull: { 'progress.completedLessons': lessonId }
            },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: 'Submission deleted successfully.' });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error deleting assignment submission', { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error deleting submission." });
    }
};

exports.deleteAssignmentSubmissionFile = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { lessonId, publicId } = req.params;
        const userId = req.user._id;

        const lesson = await Lesson.findById(lessonId).select('program').session(session);
        if (!lesson) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: 'Lesson not found.' });
        }

        const enrollment = await Enrollment.findOne({ user: userId, program: lesson.program }).session(session);
        if (!enrollment) {
            await session.abortTransaction(); session.endSession();
            return res.status(403).json({ message: "Not enrolled in this program." });
        }

        const lessonProgress = enrollment.progress.lessonDetails.find(ld => ld.lesson.equals(lessonId));
        if (!lessonProgress?.submission?.files) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: 'Submission or file not found.' });
        }

        const fileIndex = lessonProgress.submission.files.findIndex(f => f.publicId === publicId);
        if (fileIndex === -1) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: 'File not found in submission.' });
        }

        // Deletion from Cloudinary should happen outside the transaction for atomicity of DB operations
        await cloudinary.uploader.destroy(publicId);

        // Remove from DB
        await Enrollment.updateOne(
            { _id: enrollment._id, 'progress.lessonDetails.lesson': lessonId },
            { $pull: { 'progress.lessonDetails.$.submission.files': { publicId: publicId } } },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        const updatedEnrollment = await Enrollment.findById(enrollment._id).lean();
        const updatedLessonProgress = updatedEnrollment.progress.lessonDetails.find(ld => ld.lesson.equals(lessonId));

        res.status(200).json({ 
            message: 'File deleted successfully.',
            submission: updatedLessonProgress?.submission
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error deleting assignment file', { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error deleting file." });
    }
};

exports.savePresentationNotes = async (req, res) => {
    console.log('\n--- 4. [Controller:savePresentationNotes] Request received by controller ---');
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { enrollmentId, lessonId } = req.params;
        const { slideId, note } = req.body;
        const userId = req.user._id;

        console.log(`  - PARAMS: enrollmentId=${enrollmentId}, lessonId=${lessonId}`);
        console.log(`  - BODY: slideId=${slideId}, note="${note}"`);

        const enrollment = await Enrollment.findById(enrollmentId).session(session);

        if (!enrollment) {
            console.error(`  - ERROR: Enrollment not found for ID: ${enrollmentId}. Aborting.`);
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Enrollment not found." });
        }
        console.log(`  - SUCCESS: Found enrollment document for user ${enrollment.user}.`);

        if (!enrollment.user.equals(userId)) {
            console.error(`  - ERROR: User ${userId} does not own enrollment. Aborting.`);
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: "Access denied." });
        }

        let lessonProgress = enrollment.progress.lessonDetails.find(ld => ld.lesson.equals(lessonId));
        
        if (!lessonProgress) {
            console.log(`  - INFO: No existing lessonProgress for lesson ${lessonId}. Creating new entry.`);
            enrollment.progress.lessonDetails.push({ lesson: lessonId, status: 'in_progress', submission: { presentationNotes: [] } });
            lessonProgress = enrollment.progress.lessonDetails[enrollment.progress.lessonDetails.length - 1];
        } else {
             console.log(`  - INFO: Found existing lessonProgress for lesson ${lessonId}.`);
        }

        if (!lessonProgress.submission) { lessonProgress.submission = { presentationNotes: [] }; }
        if (!lessonProgress.submission.presentationNotes) { lessonProgress.submission.presentationNotes = []; }

        console.log('  - STATE (before modification):', JSON.stringify(lessonProgress.submission.presentationNotes));
        
        const noteIndex = lessonProgress.submission.presentationNotes.findIndex(n => n.slideId.equals(slideId));
        
        if (noteIndex > -1) {
            console.log(`  - LOGIC: Found existing note at index ${noteIndex}. Updating.`);
            if (note) {
                 lessonProgress.submission.presentationNotes[noteIndex].note = note;
            } else {
                console.log(`  - LOGIC: Note content is empty. Removing note from array.`);
                lessonProgress.submission.presentationNotes.splice(noteIndex, 1);
            }
        } else if (note) {
            console.log(`  - LOGIC: No existing note found. Pushing new note to array.`);
            lessonProgress.submission.presentationNotes.push({ slideId, note });
        } else {
             console.log(`  - LOGIC: No existing note and new note is empty. Doing nothing.`);
        }
        
        console.log('  - STATE (after modification):', JSON.stringify(lessonProgress.submission.presentationNotes));
        
        enrollment.markModified('progress.lessonDetails');
        console.log(`  - ACTION: Called markModified('progress.lessonDetails').`);
        console.log(`  - VERIFY: enrollment.isModified('progress.lessonDetails') ==> ${enrollment.isModified('progress.lessonDetails')}`);
        
        await enrollment.save({ session });
        console.log(`--- 5. [Controller:savePresentationNotes] enrollment.save() executed.`);

        await session.commitTransaction();
        console.log(`--- 6. [Controller:savePresentationNotes] Transaction committed.`);
        session.endSession();

         const updatedEnrollment = await Enrollment.findById(enrollmentId).lean();
        res.status(200).json({ success: true, message: "Note saved.", enrollment: updatedEnrollment });
        
    } catch (error) {
        if (session.inTransaction()) {
            console.error('--- [Controller:savePresentationNotes] CATCH BLOCK: Error occurred in transaction. Aborting.');
            await session.abortTransaction();
        }
        session.endSession();
        console.error('--- [Controller:savePresentationNotes] CATCH BLOCK ERROR ---', error);
        res.status(500).json({ message: "Error saving note.", error: error.message });
    }
};

exports.addAudioToSlide = async (req, res) => {
    // --- START: HEAVY LOGGING ---
    console.log('\n--- [Controller:addAudioToSlide] REQUEST RECEIVED ---');
    console.log(`- Timestamp: ${new Date().toISOString()}`);
    console.log(`- Params: lessonId=${req.params.lessonId}, slideId=${req.params.slideId}`);
    console.log('- Request Files:', req.files);
    console.log('- Request Body:', req.body);
    // --- END: HEAVY LOGGING ---
    
    try {
        const { lessonId, slideId } = req.params;
        const { waveform } = req.body;
        const audioFile = req.files?.audio;

        if (!audioFile) {
            console.error('[Controller:addAudioToSlide] ERROR: No audio file provided.');
            return res.status(400).json({ message: 'No audio file provided.' });
        }

        const lesson = await Lesson.findById(lessonId);
        if (!lesson || !await isProgramCoach(lesson.program, req.user._id)) {
            console.log(`[Controller:addAudioToSlide] FORBIDDEN: User ${req.user._id} cannot access this lesson.`);
            return res.status(403).json({ message: 'Forbidden or lesson not found.' });
        }

        const slide = lesson.content.presentation.slides.id(slideId);
        if (!slide) {
             console.log(`[Controller:addAudioToSlide] NOT FOUND: Slide ${slideId} not in lesson.`);
            return res.status(404).json({ message: 'Slide not found in this lesson.' });
        }

        if (slide.audioPublicId) {
            assetCleanupService.queueAssetDeletion(slide.audioPublicId, 'video');
        }
        
        console.log(`[Controller:addAudioToSlide] Uploading new audio to Cloudinary...`);
        const result = await cloudinary.uploader.upload(audioFile.tempFilePath, {
            folder: `program_content/audio/${req.user._id}/${lessonId}`,
            resource_type: 'video',
            type: 'private'
        });
        console.log(`[Controller:addAudioToSlide] Cloudinary upload successful. Public ID: ${result.public_id}`);

        slide.audioUrl = result.secure_url;
        slide.audioPublicId = result.public_id;
        slide.duration = result.duration;

        let parsedWaveform = [];
        if (waveform) {
            console.log(`[Controller:addAudioToSlide] Received waveform string from client: ${waveform.substring(0, 100)}...`);
            try {
                parsedWaveform = JSON.parse(waveform);
                slide.waveform = parsedWaveform;
                console.log(`[Controller:addAudioToSlide] Waveform parsed successfully. Length: ${parsedWaveform.length}. First 5 values:`, parsedWaveform.slice(0, 5));
            } catch(e) {
                console.error('[Controller:addAudioToSlide] ERROR parsing waveform data from client', { slideId, error: e.message });
                slide.waveform = [];
            }
        } else {
            console.warn('[Controller:addAudioToSlide] No waveform data received from client.');
            slide.waveform = [];
        }

        console.log('[Controller:addAudioToSlide] DATA BEFORE SAVE:', {
            audioUrl: slide.audioUrl,
            duration: slide.duration,
            waveformLength: slide.waveform.length
        });
        await lesson.save();
        console.log('[Controller:addAudioToSlide] Lesson saved successfully.');

        const responsePayload = {
            message: 'Audio added successfully.',
            audioUrl: result.secure_url,
            audioPublicId: result.public_id,
            duration: result.duration,
            waveform: slide.waveform
        };

        console.log('[Controller:addAudioToSlide] SENDING RESPONSE:', responsePayload);
        res.status(200).json(responsePayload);

    } catch (error) {
        console.error('[Controller:addAudioToSlide] *** CRITICAL CATCH BLOCK ERROR ***', { 
            errorMessage: error.message, 
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error adding audio.', error: error.message });
    }
};

exports.deleteAudioFromSlide = async (req, res) => {
    try {
        const { lessonId, slideId } = req.params;

        const lesson = await Lesson.findById(lessonId);
        if (!lesson || !await isProgramCoach(lesson.program, req.user._id)) {
            return res.status(403).json({ message: 'Forbidden or lesson not found.' });
        }

        const slide = lesson.content.presentation.slides.id(slideId);
        if (!slide) {
            return res.status(404).json({ message: 'Slide not found in this lesson.' });
        }

        if (slide.audioPublicId) {
            await cloudinary.uploader.destroy(slide.audioPublicId, { resource_type: 'video' });
        }

        slide.audioUrl = null;
        slide.audioPublicId = null;
        slide.duration = null;
        slide.waveform = [];

        await lesson.save();

        res.status(200).json({
            message: 'Audio deleted successfully.',
            audioUrl: null,
            audioPublicId: null,
            duration: 0,
            waveform: []
        });

    } catch (error) {
        logger.error('Error deleting audio from slide', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error deleting audio.', error: error.message });
    }
};

exports.trimAudioOnSlide = async (req, res) => {
    try {
        const { lessonId, slideId } = req.params;
        const { startTime, endTime, waveform } = req.body;

        if (typeof startTime !== 'number' || typeof endTime !== 'number' || startTime >= endTime) {
            return res.status(400).json({ message: 'Invalid start or end time for trimming.' });
        }

        const lesson = await Lesson.findById(lessonId);
        if (!lesson || !await isProgramCoach(lesson.program, req.user._id)) {
            return res.status(403).json({ message: 'Forbidden or lesson not found.' });
        }

        const slide = lesson.content.presentation.slides.id(slideId);
        if (!slide || !slide.audioPublicId || !slide.audioUrl) {
            return res.status(404).json({ message: 'Slide or original audio not found.' });
        }

        const originalPublicId = slide.audioPublicId;
        const originalUrl = slide.audioUrl;

        const result = await cloudinary.uploader.upload(originalUrl, {
            resource_type: 'video',
            folder: `program_content/audio/${req.user._id}/${lessonId}`,
            transformation: [
                { start_offset: startTime, end_offset: endTime }
            ]
        });

        slide.audioUrl = result.secure_url;
        slide.audioPublicId = result.public_id;
        slide.duration = result.duration;
        slide.waveform = waveform || [];

        await lesson.save();

       assetCleanupService.queueAssetDeletion(originalPublicId, 'video');

        res.status(200).json({
            message: 'Audio trimmed successfully.',
            audioUrl: result.secure_url,
            audioPublicId: result.public_id,
            duration: result.duration,
            waveform: slide.waveform
        });

    } catch (error) {
        logger.error('Error trimming audio on slide', { error: error.message, stack: error.stack, cloudinaryError: error.error });
        res.status(500).json({ message: 'Error trimming audio.', error: error.message });
    }
};

exports.updateSlideEnhancements = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { lessonId, slideId } = req.params;
        const { overlays, resources, authorComment } = req.body;

        const lesson = await Lesson.findById(lessonId).session(session);
        if (!lesson) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Lesson not found.' });
        }

        if (!await isProgramCoach(lesson.program, req.user._id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'Forbidden.' });
        }

        const slide = lesson.content.presentation.slides.id(slideId);
        if (!slide) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Slide not found.' });
        }

        // Replace the arrays. This is simpler and safer than patching.
        slide.overlays = overlays || [];
        slide.resources = resources || [];
        slide.authorComment = authorComment;

        await lesson.save({ session });
        await session.commitTransaction();
        session.endSession();

        // Return the updated slide so the frontend can sync its state
        res.status(200).json(slide);

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error updating slide enhancements', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error updating slide enhancements.', error: error.message });
    }
};

exports.updatePresentationProgress = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { enrollmentId, lessonId } = req.params;
        const { lastViewedSlideIndex } = req.body;
        const userId = req.user._id;

        if (typeof lastViewedSlideIndex !== 'number') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid slide index provided.' });
        }

        const enrollment = await Enrollment.findById(enrollmentId).session(session);

        if (!enrollment || !enrollment.user.equals(userId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: "Access denied." });
        }

        let lessonProgress = enrollment.progress.lessonDetails.find(ld => ld.lesson.equals(lessonId));

        if (!lessonProgress) {
            enrollment.progress.lessonDetails.push({ lesson: lessonId, status: 'in_progress', submission: { lastViewedSlideIndex: 0 } });
            lessonProgress = enrollment.progress.lessonDetails[enrollment.progress.lessonDetails.length - 1];
        } else if (!lessonProgress.submission) {
            lessonProgress.submission = { lastViewedSlideIndex: 0 };
        }
        
        lessonProgress.submission.lastViewedSlideIndex = lastViewedSlideIndex;

        await enrollment.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ success: true, message: "Progress updated." });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error updating presentation progress', { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error updating progress.", error: error.message });
    }
};

exports.handleSuccessfulProgramEnrollment = async (paymentIntent) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { programId, userId, paymentId, coachId } = paymentIntent.metadata;

        const existingEnrollment = await Enrollment.findOne({ user: userId, program: programId }).session(session);
        if (existingEnrollment) {
            logger.warn('Attempted to create a duplicate program enrollment from webhook.', { userId, programId });
            await session.abortTransaction();
            session.endSession();
            return;
        }

        const program = await Program.findById(programId).select('title totalLessons').session(session);
        const user = await User.findById(userId).select('firstName lastName').session(session);
        const coach = await User.findById(coachId).select('firstName lastName').session(session);

        if (!program || !user || !coach) {
            throw new Error(`Critical data missing for enrollment. Program: ${!!program}, User: ${!!user}, Coach: ${!!coach}`);
        }

        const newEnrollment = new Enrollment({
            user: userId,
            program: programId,
            payment: paymentId,
            progress: { totalLessons: program.totalLessons || 0 },
            status: 'active'
        });
        await newEnrollment.save({ session });
        
        await Program.findByIdAndUpdate(programId, { 
            $inc: { 
                enrollmentsCount: 1,
                revenue: (paymentIntent.amount_received / 100)
            }
        }, { session });

        await User.findByIdAndUpdate(userId, { $push: { enrollments: newEnrollment._id } }).session(session);

        unifiedNotificationService.sendNotification({
            type: NotificationTypes.PROGRAM_PURCHASE_CONFIRMED,
            recipient: userId,
            metadata: {
                programId: programId,
                programTitle: program.title,
                coachName: `${coach.firstName} ${coach.lastName}`,
                amount: (paymentIntent.amount_received / 100),
                currency: paymentIntent.currency
            }
        });

        unifiedNotificationService.sendNotification({
            type: NotificationTypes.PROGRAM_SALE_COACH,
            recipient: coachId,
            sender: userId,
            metadata: {
                programId: programId,
                programTitle: program.title,
                clientName: `${user.firstName} ${user.lastName}`,
                amount: (paymentIntent.amount_received / 100),
                currency: paymentIntent.currency
            }
        });

        await session.commitTransaction();
        session.endSession();
        console.log('Successfully handled program enrollment from webhook.', { programId, userId, paymentId });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error in handleSuccessfulProgramEnrollment', { error: error.message, stack: error.stack, paymentIntentId: paymentIntent.id });
        throw error;
    }
};

exports.getProgramsByCoachId = async (req, res) => {
  const { coachId } = req.params;
  console.log(`[programController.getProgramsByCoachId] START: Received request for coachId: ${coachId}`);

  if (!coachId) {
    console.error('[programController.getProgramsByCoachId] FAIL: Coach ID is missing in request params.');
    return res.status(400).json({ message: 'Coach ID is required.' });
  }

  try {
    const programs = await Program.find({ coach: coachId })
        .populate({ path: 'modules', populate: { path: 'lessons' }})
        .populate('categories')
        .populate('language')
        .populate('skillLevel')
        .sort({ updatedAt: -1 })
        .lean();
    console.log(`[programController.getProgramsByCoachId] SUCCESS: Found ${programs.length} programs for coachId: ${coachId}`);
    
    const responseData = { docs: programs };
    
    console.log('[programController.getProgramsByCoachId] SENDING response.');
    res.status(200).json(responseData);
  } catch (error) {
    console.error(`[programController.getProgramsByCoachId] FATAL: Server error while fetching programs for coach ${coachId}:`, error);
    res.status(500).json({ message: 'Server error fetching programs.' });
  }
};

exports.getProgramSubmissions = async (req, res) => {
    console.log('[SUBMISSIONS_RETRIEVAL_TRACE] 1. ENTERING getProgramSubmissions.');
    try {
        const { programId } = req.params;
        
        if (!await isProgramCoach(programId, req.user._id)) {
            return res.status(403).json({ message: 'Forbidden: You are not the coach of this program.' });
        }

        const lessonsInProgram = await Lesson.find({ program: programId }).select('_id title').lean();
        const lessonMap = new Map(lessonsInProgram.map(l => [l._id.toString(), l.title]));

        console.log(`[SUBMISSIONS_RETRIEVAL_TRACE] 1b. Executing query for programId: ${programId} (Type: ${typeof programId})`);

        const enrollments = await Enrollment.find({
            program: programId,
            'progress.lessonDetails': {
                $elemMatch: {
                    submission: { $exists: true, $ne: null }
                }
            }
        })
        .populate('user', 'firstName lastName email profilePicture')
        .lean();
        
        console.log(`[SUBMISSIONS_RETRIEVAL_TRACE] 2. Found ${enrollments.length} enrollments that contain a submission object.`);

        const submissionsByLesson = {};

        for (const enrollment of enrollments) {
            for (const detail of enrollment.progress.lessonDetails) {
                if (detail.submission && (detail.submission.text || detail.submission.files?.length > 0)) {
                    const lessonId = detail.lesson.toString();
                    if (!submissionsByLesson[lessonId]) {
                        submissionsByLesson[lessonId] = {
                            lessonId: lessonId,
                            lessonTitle: lessonMap.get(lessonId) || 'Unknown Lesson',
                            submissions: []
                        };
                    }
                    submissionsByLesson[lessonId].submissions.push({
                        enrollmentId: enrollment._id,
                        user: enrollment.user,
                        submittedAt: detail.submission.submittedAt,
                        submission: detail.submission
                    });
                }
            }
        }

        const result = Object.values(submissionsByLesson).map(lessonGroup => {
            lessonGroup.submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
            return lessonGroup;
        });
        
        result.sort((a, b) => {
            const latestA = a.submissions[0]?.submittedAt || 0;
            const latestB = b.submissions[0]?.submittedAt || 0;
            return new Date(latestB) - new Date(latestA);
        });
        
        console.log('[SUBMISSIONS_RETRIEVAL_TRACE] 3. Data structure BEFORE signing URLs:', JSON.stringify(result, null, 2));

        const expiration = Math.floor(Date.now() / 1000) + 3600;

        for (const lessonGroup of result) {
            for (const sub of lessonGroup.submissions) {
                if (sub.submission.files && sub.submission.files.length > 0) {
                    for (const file of sub.submission.files) {
                        console.log(`[SUBMISSIONS_RETRIEVAL_TRACE] 4. PROCESSING FILE for signing. Public ID: "${file.publicId}", Stored resource_type: "${file.resource_type}"`);
                        if (file.publicId) {
                            const signingOptions = {
                                resource_type: file.resource_type || 'auto',
                                type: 'private',
                                sign_url: true,
                                expires_at: expiration,
                            };
                            console.log('[SUBMISSIONS_RETRIEVAL_TRACE] 5. Options object for Cloudinary:', JSON.stringify(signingOptions));
                            try {
                                const newUrl = cloudinary.url(file.publicId, signingOptions);
                                console.log(`[SUBMISSIONS_RETRIEVAL_TRACE] 6. SUCCESS: Generated new signed URL: "${newUrl}"`);
                                file.url = newUrl;
                            } catch (e) {
                                console.error(`[SUBMISSIONS_RETRIEVAL_TRACE] 7. FATAL ERROR during URL signing for publicId "${file.publicId}"`, e);
                                file.url = null;
                                file.error = 'Failed to generate secure URL.';
                            }
                        } else {
                            console.log('[SUBMISSIONS_RETRIEVAL_TRACE] 8. SKIPPED: File has no publicId.');
                        }
                    }
                }
            }
        }
        
        console.log('[SUBMISSIONS_RETRIEVAL_TRACE] 9. Final data structure AFTER signing URLs:', JSON.stringify(result, null, 2));

        res.status(200).json(result);

    } catch (error) {
        console.error('[SUBMISSIONS_RETRIEVAL_TRACE] X. CATCH BLOCK ERROR in getProgramSubmissions:', error);
        logger.error('Error fetching program submissions', { error: error.message, stack: error.stack, programId: req.params.programId });
        res.status(500).json({ message: 'Error fetching submissions' });
    }
};