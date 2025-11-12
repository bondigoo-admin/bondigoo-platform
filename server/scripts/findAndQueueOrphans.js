const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const mongoose = require('mongoose');
const cloudinary = require('../utils/cloudinaryConfig');
const { logger } = require('../utils/logger');

const User = require('../models/User');
const Coach = require('../models/Coach');
const Program = require('../models/Program');
const Lesson = require('../models/Lesson');
const Message = require('../models/Message');
const Session = require('../models/Session');
const Invoice = require('../models/Invoice');
const Lead = require('../models/Lead');
const OrphanedAsset = require('../models/OrphanedAsset');
const Enrollment = require('../models/Enrollment');

const DRY_RUN = process.argv.includes('--dry-run');

function extractAssetType(folder, publicId) {
    if (!folder && !publicId) return 'unknown';
    const path = publicId.includes('/') ? publicId : (folder ? `${folder}/${publicId}` : publicId);

    if (path.includes('profile_pictures')) return 'profile_picture';
    if (path.includes('/programs/')) return 'program_asset';
    if (path.includes('/assignments/')) return 'assignment_submission';
    if (path.includes('session_recordings')) return 'session_recording';
    if (path.includes('/resources') || path.includes('/course_materials')) return 'session_resource';
    if (path.includes('/backgrounds')) return 'user_background';
    if (path.includes('/verification')) return 'coach_verification_doc';
    if (path.includes('b2b_documents') || publicId.startsWith('b2b_doc_')) return 'b2b_invoice';
    if (path.includes('coach_applications')) return 'coach_application_doc';
    if (path.startsWith('feedback_attachments')) return 'feedback_attachment';
    if (path.includes('/session_images')) return 'session_image';
    return 'unknown';
}

async function findOrphans() {
  console.log(`[OrphanFinder] Starting job. DRY_RUN mode is ${DRY_RUN ? 'ENABLED' : 'DISABLED'}.`);

  if (!process.env.MONGODB_URI || !process.env.CLOUDINARY_CLOUD_NAME) {
    console.error(`[OrphanFinder] FATAL: MONGODB_URI or CLOUDINARY_CLOUD_NAME is not defined in ${envFile}.`);
    process.exit(1);
  }

  let mongoConnection;
  try {
    console.log('[OrphanFinder] Step 1: Connecting to MongoDB...');
    mongoConnection = await mongoose.connect(process.env.MONGODB_URI);
    console.log('[OrphanFinder] Step 1: SUCCESS - Connected to MongoDB.');

    const knownPublicIds = new Set();
    console.log('[OrphanFinder] Step 2: Starting to gather all known public_ids from database...');

    const processDocuments = (docs, extractFn) => {
        for (const doc of docs) { extractFn(doc); }
    };
    
    console.log('[OrphanFinder] Step 2a: Processing Users & Coaches...');
    processDocuments(await User.find({ $or: [{ 'profilePicture.publicId': { $exists: true } }, { 'backgrounds.0': { $exists: true } }] }).select('profilePicture.publicId backgrounds.publicId').lean(), doc => {
        if (doc.profilePicture?.publicId) knownPublicIds.add(doc.profilePicture.publicId);
        doc.backgrounds?.forEach(bg => bg.publicId && knownPublicIds.add(bg.publicId));
    });
    processDocuments(await Coach.find({ $or: [{ 'profilePicture.publicId': { $exists: true } }, { 'videoIntroduction.publicId': { $exists: true } }, { 'settings.insuranceRecognition.registries.verificationDocument.publicId': { $exists: true } }] }).select('profilePicture.publicId videoIntroduction.publicId settings.insuranceRecognition.registries.verificationDocument.publicId').lean(), doc => {
        if (doc.profilePicture?.publicId) knownPublicIds.add(doc.profilePicture.publicId);
        if (doc.videoIntroduction?.publicId) knownPublicIds.add(doc.videoIntroduction.publicId);
        doc.settings?.insuranceRecognition?.registries?.forEach(reg => reg.verificationDocument?.publicId && knownPublicIds.add(reg.verificationDocument.publicId));
    });
    console.log(`[OrphanFinder] Step 2a: SUCCESS - IDs after Users & Coaches: ${knownPublicIds.size}`);

    console.log('[OrphanFinder] Step 2b: Processing Programs & Lessons...');
    processDocuments(await Program.find({ $or: [{'programImages.0': {$exists: true}}, {'trailerVideo.publicId': {$exists: true}}]}).select('programImages.publicId trailerVideo.publicId').lean(), doc => {
        doc.programImages?.forEach(img => img.publicId && knownPublicIds.add(img.publicId));
        if (doc.trailerVideo?.publicId) knownPublicIds.add(doc.trailerVideo.publicId);
    });
    processDocuments(await Lesson.find({ $or: [{'content.files.0': {$exists: true}}, {'content.presentation.slides.0': {$exists: true}}, {'resources.0': {$exists: true}}, {'content.presentation.originalFilePublicId': {$exists: true}}] }).select('content resources').lean(), doc => {
        if (doc.content?.presentation?.originalFilePublicId) knownPublicIds.add(doc.content.presentation.originalFilePublicId);
        doc.content?.files?.forEach(file => file.publicId && knownPublicIds.add(file.publicId));
        doc.content?.presentation?.slides?.forEach(slide => {
            if (slide.imagePublicId) knownPublicIds.add(slide.imagePublicId);
            if (slide.audioPublicId) knownPublicIds.add(slide.audioPublicId);
        });
        doc.resources?.forEach(res => res.publicId && knownPublicIds.add(res.publicId));
    });
    console.log(`[OrphanFinder] Step 2b: SUCCESS - IDs after Programs & Lessons: ${knownPublicIds.size}`);

    console.log('[OrphanFinder] Step 2c: Processing Enrollments (Assignment Submissions)...');
    processDocuments(await Enrollment.find({ 'progress.lessonDetails.submission.files.0': { $exists: true } }).select('progress.lessonDetails.submission.files.publicId').lean(), doc => {
        doc.progress?.lessonDetails?.forEach(detail => {
            detail.submission?.files?.forEach(file => file.publicId && knownPublicIds.add(file.publicId));
        });
    });
    console.log(`[OrphanFinder] Step 2c: SUCCESS - IDs after Enrollments: ${knownPublicIds.size}`);

    console.log('[OrphanFinder] Step 2d: Processing Sessions...');
    processDocuments(await Session.find({ $or: [{'recordings.publicId': {$exists: true}}, {'sessionImages.publicId': {$exists: true}}, {'courseMaterials.publicId': {$exists: true}}] }).select('recordings.publicId sessionImages.publicId courseMaterials.publicId').lean(), doc => {
        doc.recordings?.forEach(rec => rec.publicId && knownPublicIds.add(rec.publicId));
        doc.sessionImages?.forEach(img => img.publicId && knownPublicIds.add(img.publicId));
        doc.courseMaterials?.forEach(mat => mat.publicId && knownPublicIds.add(mat.publicId));
    });
    console.log(`[OrphanFinder] Step 2d: SUCCESS - IDs after Sessions: ${knownPublicIds.size}`);

    console.log('[OrphanFinder] Step 2e: Processing Invoices...');
    processDocuments(await Invoice.find({ invoiceParty: 'coach_to_platform', pdfUrl: { $exists: true } }).select('_id').lean(), doc => {
        knownPublicIds.add(`b2b_documents/b2b_doc_${doc._id}`);
    });
    console.log(`[OrphanFinder] Step 2e: SUCCESS - IDs after Invoices: ${knownPublicIds.size}`);

    console.log('[OrphanFinder] Step 2f: Processing Leads...');
    processDocuments(await Lead.find({ 'uploadedDocuments.0': { $exists: true } }).select('uploadedDocuments.publicId').lean(), doc => {
        doc.uploadedDocuments?.forEach(upDoc => upDoc.publicId && knownPublicIds.add(upDoc.publicId));
    });
    console.log(`[OrphanFinder] Step 2f: SUCCESS - IDs after Leads: ${knownPublicIds.size}`);

    console.log('[OrphanFinder] Step 2g: Processing Messages (in batches)...');
    let lastMsgId = null;
    let messageBatchCount = 0;
    while (true) {
        const query = { 'attachment.0': { $exists: true } };
        if (lastMsgId) query._id = { '$gt': lastMsgId };
        const messages = await Message.find(query).sort({_id: 1}).limit(5000).select('attachment.publicId').lean();
        if (messages.length === 0) break;
        messages.forEach(doc => doc.attachment?.forEach(att => att.publicId && knownPublicIds.add(att.publicId)));
        lastMsgId = messages[messages.length - 1]._id;
        messageBatchCount++;
    }
    console.log(`[OrphanFinder] Step 2g: SUCCESS - Processed ${messageBatchCount} message batches.`);
    console.log(`[OrphanFinder] Step 2: SUCCESS - FINISHED gathering. Total unique known public_ids: ${knownPublicIds.size}`);

    const FOLDERS_TO_EXCLUDE = new Set(["b2b_documents", "user_messages"]);

    console.log('[OrphanFinder] Step 3: Starting to scan all assets from Cloudinary...');
    const resourceTypesToScan = ['image', 'video', 'raw'];
    const assetTypesToScan = ['upload', 'private'];
    const orphansToCreate = [];

    for (const resourceType of resourceTypesToScan) {
        for (const assetType of assetTypesToScan) {
            console.log(`[OrphanFinder] Step 3: Scanning Cloudinary for resource_type: '${resourceType}', type: '${assetType}'...`);
            let nextCursor = null;
            let totalScanned = 0;
            do {
                const result = await cloudinary.api.resources({ type: assetType, resource_type: resourceType, max_results: 500, next_cursor: nextCursor });
                for (const asset of result.resources) {
                    if (!knownPublicIds.has(asset.public_id) && !FOLDERS_TO_EXCLUDE.has(asset.folder)) {
                        orphansToCreate.push({
                            publicId: asset.public_id,
                            resourceType: asset.resource_type,
                            assetType: extractAssetType(asset.folder, asset.public_id),
                            folder: asset.folder,
                            fileSize: asset.bytes,
                            format: asset.format,
                            createdAtCloudinary: new Date(asset.created_at),
                        });
                    }
                }
                totalScanned += result.resources.length;
                nextCursor = result.next_cursor;
            } while (nextCursor);
            console.log(`[OrphanFinder] Step 3: SUCCESS - Scanned ${totalScanned} '${resourceType}/${assetType}' assets.`);
        }
    }
    console.log(`[OrphanFinder] Step 3: SUCCESS - FINISHED scanning Cloudinary. Found ${orphansToCreate.length} potential orphans.`);

    console.log('[OrphanFinder] Step 4: Preparing to update the orphan review queue in the database...');
    if (DRY_RUN) {
        console.log('[OrphanFinder] Step 4: SKIPPED - DRY RUN ENABLED. Logging found orphans instead of writing to DB.');
        if (orphansToCreate.length > 0) {
            console.log('\n--- POTENTIAL ORPHANS FOUND ---');
            console.log(JSON.stringify(orphansToCreate.slice(0, 50), null, 2));
            if (orphansToCreate.length > 50) console.log(`... and ${orphansToCreate.length - 50} more.`);
            console.log(`--- Total: ${orphansToCreate.length} ---`);
        }
    } else if (orphansToCreate.length > 0) {
        const bulkOps = orphansToCreate.map(orphan => ({
            updateOne: { filter: { publicId: orphan.publicId }, update: { $setOnInsert: orphan }, upsert: true }
        }));

        console.log(`[OrphanFinder] Step 4: Executing bulk write of ${bulkOps.length} orphan records...`);
        const bulkResult = await OrphanedAsset.bulkWrite(bulkOps);
        console.log(`[OrphanFinder] Step 4: SUCCESS - Bulk write complete.`, { upsertedCount: bulkResult.upsertedCount, matchedCount: bulkResult.matchedCount });
    } else {
        console.log('[OrphanFinder] Step 4: SKIPPED - No new orphans found to add to the review queue.');
    }

    console.log('[OrphanFinder] SCRIPT COMPLETED SUCCESSFULLY.');

  } catch (error) {
    console.error('[OrphanFinder] A critical error occurred during the job.');
    console.error('--- FULL ERROR OBJECT ---');
    console.error(error);
  } finally {
    if (mongoConnection) {
        await mongoose.disconnect();
        console.log('[OrphanFinder] Disconnected from MongoDB. Job finished.');
    }
  }
}

findOrphans();