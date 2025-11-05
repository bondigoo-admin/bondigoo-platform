const cloudinary = require('cloudinary').v2;
const Session = require('../models/Session');
const { logger } = require('../utils/logger');
const User = require('../models/User');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//logger.info('[ResourceController] Cloudinary config', cloudinary.config());

exports.uploadResource = async (req, res) => {
  // sessionId here is expected to be the sessionLink.sessionId string from the frontend panel
  const { sessionId: sessionLinkSessionId } = req.body;
  const file = req.files?.file; // Use optional chaining
  const userId = req.user._id.toString(); // Get userId from authenticated user

  // 1. Validate Input
  if (!file || !sessionLinkSessionId) {
    logger.warn('[uploadResource] Missing file or session identifier in request body', { hasFile: !!file, sessionLinkSessionId });
    return res.status(400).json({ success: false, message: 'Missing file or session identifier' });
  }

  try {
    // 2. Find Booking by sessionLinkSessionId & Populate Coach for Auth
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionLinkSessionId }).populate('coach user'); // Populate coach and user
    if (!booking) {
        logger.warn('[uploadResource] Booking not found for session link ID', { sessionLinkSessionId });
        return res.status(404).json({ success: false, message: 'Booking not found for this session identifier' });
    }

    // 3. Authorization check (Only coach can upload)
    if (booking.coach._id.toString() !== userId) {
        logger.warn('[uploadResource] Unauthorized attempt to upload resource', { bookingId: booking._id.toString(), userId });
        return res.status(403).json({ success: false, message: 'Only the coach can upload resources for this session' });
    }

    // 4. Find Session by booking._id
    let session = await Session.findOne({ bookingId: booking._id });

    // 4a. If Session document doesn't exist, create it (optional, depends on workflow)
    // If sessions are only created when started, this upload might happen before.
    // Let's assume for now the Session *should* exist if the booking does.
    if (!session) {
         // Decide: Fail or Create? Let's fail for now, requiring session to exist.
         logger.error('[uploadResource] Session data document not found for booking', { bookingId: booking._id.toString() });
         return res.status(404).json({ success: false, message: 'Session data record not found. Has the session been initialized?' });

         // --- OR: Create if needed (Uncomment if desired) ---
         /*
         logger.warn('[uploadResource] Session data document not found, creating one.', { bookingId: booking._id.toString() });
         session = new Session({
             bookingId: booking._id,
             // Add other default fields if necessary based on SessionSchema
         });
         await session.save();
         logger.info('[uploadResource] Created new Session document.', { sessionDocId: session._id });
         */
    }

    // 5. Upload file to Cloudinary
    logger.info('[uploadResource] Uploading file to Cloudinary...', { fileName: file.name, sessionId: session._id });
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      resource_type: 'auto',
      folder: `sessions/${session.bookingId.toString()}/resources`,
      type: 'private',
      tags: [sessionLinkSessionId, session.bookingId.toString()],
    });
    logger.info('[uploadResource] Cloudinary upload successful', { publicId: result.public_id });


    // 6. Create resource subdocument object (Mongoose assigns _id automatically)
    const resource = {
      name: file.name,
      url: result.secure_url, // Use secure_url
      size: result.bytes || file.size, // Prefer Cloudinary's size if available
      uploadedAt: new Date(),
      // No need to manually create _id: mongoose.Types.ObjectId(),
    };

    // 7. Add resource to session and save
    session.resources = session.resources || []; // Initialize if array doesn't exist
    session.resources.push(resource);
    await session.save();

    // Retrieve the newly added resource with its generated _id
    const addedResource = session.resources[session.resources.length - 1];
    logger.info('[uploadResource] Resource added to session document', { sessionDocId: session._id, resourceId: addedResource._id, resourceName: addedResource.name });

    // 8. Emit Socket Event using req.io
    const io = req.io; // Use io from request object
    if (io) {
        const videoIO = io.of('/video');
        const roomName = `session:${sessionLinkSessionId}`; // Room based on link ID
        videoIO.to(roomName).emit('resource-uploaded', addedResource); // Send the object with _id
        logger.info('[uploadResource] Emitted resource-uploaded event', { roomName, resourceId: addedResource._id });
    } else {
         logger.error('[uploadResource] Socket.IO instance (req.io) not found', { bookingId: booking._id.toString() });
    }

    // 9. Send Notification (using imported service)
    if (booking.user?._id) { // Check if user exists on booking
        try {
            await UnifiedNotificationService.sendNotification({
            type: 'RESOURCE_SHARED', // Use a specific type
            recipient: booking.user._id.toString(),
            category: 'session',
            priority: 'low',
            channels: ['in_app', 'email'], // Adjust channels as needed
            content: {
                title: 'New Session Resource Shared',
                message: `Your coach shared a new resource "${addedResource.name}" for your upcoming session.`,
            },
            metadata: {
                bookingId: session.bookingId.toString(),
                sessionId: session._id.toString(), // Add Session ObjectId if useful
                resourceId: addedResource._id.toString(),
                resourceName: addedResource.name,
                resourceUrl: addedResource.url // Maybe link directly in notification?
            }
            });
            logger.info('[uploadResource] Notification sent for resource sharing', {
            sessionId: session._id.toString(),
            resourceName: addedResource.name,
            recipient: booking.user._id.toString()
            });
        } catch (notificationError) {
             logger.error('[uploadResource] Failed to send notification', { error: notificationError.message, sessionId: session._id.toString() });
             // Don't fail the whole upload for a notification error
        }
    } else {
         logger.warn('[uploadResource] Cannot send notification, user not found on booking', { bookingId: booking._id.toString() });
    }

    // 10. Send Final Response (Only ONCE)
    res.status(201).json({ success: true, resource: addedResource }); // Use 201 for created

  } catch (error) {
    logger.error('[uploadResource] Upload process error:', {
         error: error.message,
         sessionLinkSessionId: sessionLinkSessionId,
         fileName: file ? file.name : 'N/A',
         stack: error.stack // Include stack for detailed debugging
    });
    res.status(500).json({ success: false, message: 'Failed to upload resource', error: error.message });
  }
};

exports.uploadUserBackground = async (req, res) => {
  try {
    const userId = req.user._id;
    const file = req.files?.file;

    logger.info('[ResourceController] uploadUserBackground called', {
      userId,
      hasFile: !!file,
    });

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      resource_type: 'image',
      folder: `users/${userId}/backgrounds`,
      type: 'private',
      allowed_formats: ['jpg', 'png'],
    });

    const background = {
      url: result.secure_url,
      publicId: result.public_id,
      uploadedAt: new Date(),
    };

    let user = await User.findById(userId);
    if (!user) {
      logger.error('[ResourceController] User not found for upload', { userId });
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.backgrounds) user.backgrounds = [];
    user.backgrounds.push(background);
    await user.save();

    logger.info('[ResourceController] User background uploaded', { userId, url: background.url });
    res.json({ success: true, background });
  } catch (error) {
    logger.error('[ResourceController] User background upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload background' });
  }
};

exports.getUserBackgrounds = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('backgrounds').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const backgrounds = (user.backgrounds || []).map(bg => {
      if (bg.publicId) {
        return {
          ...bg,
          url: cloudinary.url(bg.publicId, {
            type: 'private',
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          })
        };
      }
      return bg;
    });

    res.json({ success: true, backgrounds });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch backgrounds' });
  }
};

exports.deleteUserBackground = async (req, res) => {
  try {
    const userId = req.user._id;
    const { publicId } = req.body;
    logger.info('[ResourceController] deleteUserBackground called', { userId, publicId });

    const user = await User.findById(userId);
    if (!user) {
      logger.error('[ResourceController] User not found for delete', { userId });
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const background = user.backgrounds.find(bg => bg.publicId === publicId);
    if (!background) {
      return res.status(404).json({ success: false, message: 'Background not found' });
    }
    user.backgrounds = user.backgrounds.filter(bg => bg.publicId !== publicId);
    await user.save();
    await cloudinary.uploader.destroy(publicId);

    logger.info('[ResourceController] Background deleted', { userId, publicId });
    res.json({ success: true });
  } catch (error) {
    logger.error('[ResourceController] Failed to delete background', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete background' });
  }
};

exports.cacheSegmentation = async (req, res) => {
  try {
    const { key, segmentation } = req.body;
    const redis = req.app.get('redis');
    await redis.setex(key, 5, JSON.stringify(segmentation)); // 5-second TTL
    logger.info('[ResourceController] Segmentation cached', { key });
    res.json({ success: true });
  } catch (error) {
    logger.error('[ResourceController] Cache segmentation error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to cache segmentation' });
  }
};

exports.getSegmentation = async (req, res) => {
  try {
    const { key } = req.params;
    const redis = req.app.get('redis');
    const segmentation = await redis.get(key);
    logger.info('[ResourceController] Segmentation retrieved', { key, found: !!segmentation });
    res.json(segmentation ? JSON.parse(segmentation) : null);
  } catch (error) {
    logger.error('[ResourceController] Get segmentation error', { error: error.message });
    res.json(null); // Fallback to null if Redis fails
  }
};