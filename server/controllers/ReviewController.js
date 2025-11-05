const Review = require('../models/Review');
const Coach = require('../models/Coach');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { logger } = require('../utils/logger');
const Program = require('../models/Program');
const Enrollment = require('../models/Enrollment');
const mongoose = require('mongoose');

exports.getCoachReviews = async (req, res) => {
  try {
    const { coachId } = req.params;
    console.log(`[ReviewController.getCoachReviews] UNIVERSAL QUERY for coachId: ${coachId}`);

    const query = {
      isPrivate: false,
      isVisible: true,
      $or: [
        { rateeId: coachId }, 
        { ratee: coachId, rateeModel: 'User' }
      ]
    };
    
    console.log(`[ReviewController.getCoachReviews] Executing DB Query: Review.find(${JSON.stringify(query)})`);

    const reviews = await Review.find(query)
      .populate('raterId', 'firstName lastName')
      .sort({ createdAt: -1 });

    console.log(`[ReviewController.getCoachReviews] DB Query Result: Found ${reviews.length} review(s).`);

    // The rest of the function remains the same...
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) {
        ratingBreakdown[r.rating] = (ratingBreakdown[r.rating] || 0) + 1;
      }
    });

    const publicReviews = reviews.map((r) => {
      if (!r.raterId || !r.raterId.firstName || !r.raterId.lastName) {
        return null;
      }
      return {
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        coachResponse: r.coachResponse,
        clientInitials: `${r.raterId.firstName[0]}.${r.raterId.lastName[0]}.`,
      };
    }).filter(Boolean);

    res.status(200).json({
      success: true,
      averageRating,
      ratingBreakdown,
      reviews: publicReviews,
    });
  } catch (error) {
    console.error('--- [ReviewController.getCoachReviews] CRITICAL ERROR ---', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
};

exports.submitClientReview = async (req, res) => {
  try {
    const { sessionId, rating, comment, privateFeedback } = req.body;
    
    logger.info('[ReviewController.submitClientReview] Starting review submission', {
      sessionId,
      userId: req.user._id,
    });

    // Fetch booking to get coach details
    const booking = await Booking.findById(sessionId).populate('coach');
    if (!booking) {
      logger.warn('[ReviewController.submitClientReview] Booking not found', { sessionId });
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!booking.coach || !booking.coach._id) {
      logger.error('[ReviewController.submitClientReview] Coach not found in booking', { sessionId });
      return res.status(400).json({ message: 'Invalid booking: coach not specified' });
    }

    // Validate coach role
    const coachUser = await User.findById(booking.coach._id);
    if (!coachUser) {
      logger.error('[ReviewController.submitClientReview] Coach user not found', { coachId: booking.coach._id });
      return res.status(500).json({ message: 'Coach user not found' });
    }
    if (coachUser.role !== 'coach') {
      logger.error('[ReviewController.submitClientReview] User is not a coach', { coachId: coachUser._id });
      return res.status(400).json({ message: 'Invalid coach: user is not a coach' });
    }

    // Check for existing review to prevent duplicates
    const existingReview = await Review.findOne({ sessionId, raterId: req.user._id });
    if (existingReview) {
      logger.warn('[ReviewController.submitClientReview] Duplicate review attempt', {
        sessionId,
        raterId: req.user._id,
      });
      return res.status(409).json({ message: 'Review already submitted for this session' });
    }

    const review = new Review({
      sessionId,
      raterId: req.user._id, // Client submitting the review
      rateeId: booking.coach._id, // Coach being reviewed
      rating,
      comment,
      privateFeedback,
    });

    logger.info('[ReviewController.submitClientReview] Saving review', {
      raterId: req.user._id,
      rateeId: booking.coach._id,
      rating,
    });

    await review.save();

    // Update coach's isTopCoach status in Coach model
    const coachProfile = await Coach.findOne({ user: booking.coach._id });
    if (!coachProfile) {
      logger.warn('[ReviewController.submitClientReview] Coach profile not found', { userId: booking.coach._id });
      // Not a fatal error; review is saved, so proceed
    } else {
      const reviews = await Review.find({ rateeId: booking.coach._id });
      const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      coachProfile.isTopCoach = averageRating >= 4.8 && reviews.length >= 50;
      await coachProfile.save();

      logger.info('[ReviewController.submitClientReview] Coach profile updated', {
        coachId: coachProfile._id,
        userId: booking.coach._id,
        isTopCoach: coachProfile.isTopCoach,
        averageRating,
        reviewCount: reviews.length,
      });
    }

    logger.info('[ReviewController.submitClientReview] Review submitted successfully', {
      reviewId: review._id,
    });

    res.status(201).json(review);
  } catch (error) {
    logger.error('[ReviewController.submitClientReview] Error:', {
      message: error.message,
      stack: error.stack,
      sessionId: req.body.sessionId,
      userId: req.user._id,
    });
    res.status(500).json({ message: 'Failed to submit review' });
  }
};

exports.submitCoachReview = async (req, res) => {
  try {
    const { sessionId, ratings, notificationId } = req.body;

    logger.info('[ReviewController.submitCoachReview] Starting review submission', {
      sessionId,
      coachId: req.user._id,
    });

    // Validate input
    if (!sessionId || !ratings || !Array.isArray(ratings) || ratings.length === 0) {
      logger.warn('[ReviewController.submitCoachReview] Invalid input data', {
        sessionId,
        ratingsProvided: !!ratings,
        ratingsLength: ratings?.length || 0,
      });
      return res.status(400).json({ message: 'Session ID and ratings are required' });
    }

    // Fetch booking to get client details
    const booking = await Booking.findById(sessionId).populate('user');
    if (!booking) {
      logger.warn('[ReviewController.submitCoachReview] Booking not found', { sessionId });
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!booking.user || !booking.user._id) {
      logger.error('[ReviewController.submitCoachReview] Client not found in booking', { sessionId });
      return res.status(400).json({ message: 'Invalid booking: client not specified' });
    }

    // Ensure the requester is the coach
    if (booking.coach.toString() !== req.user._id.toString()) {
      logger.warn('[ReviewController.submitCoachReview] Unauthorized review attempt', {
        sessionId,
        coachId: req.user._id,
        bookingCoachId: booking.coach.toString(),
      });
      return res.status(403).json({ message: 'Not authorized to review this session' });
    }

    // Check for existing review to prevent duplicates
    const existingReview = await Review.findOne({ sessionId, raterId: req.user._id });
    if (existingReview) {
      logger.warn('[ReviewController.submitCoachReview] Duplicate review attempt', {
        sessionId,
        raterId: req.user._id,
      });
      return res.status(409).json({ message: 'Review already submitted for this session' });
    }

    const review = new Review({
      sessionId,
      raterId: req.user._id, // Coach submitting the review
      rateeId: booking.user._id, // Client being reviewed
      rating: ratings[0].rating,
      comment: ratings[0].comment || '',
    });

    logger.info('[ReviewController.submitCoachReview] Saving review', {
      raterId: req.user._id,
      rateeId: booking.user._id,
      rating: ratings[0].rating,
    });

    await review.save();

    // Update notification status if notificationId is provided
    if (notificationId) {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: req.user._id },
        { status: 'actioned', actionedAt: new Date() },
        { new: true } // Corrected syntax here
      );
      if (notification) {
        logger.info('[ReviewController.submitCoachReview] Notification marked as actioned', {
          notificationId,
          userId: req.user._id,
        });

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
          io.to(req.user._id.toString()).emit('notification_actioned', {
            notificationId,
            status: 'actioned',
            timestamp: new Date().toISOString(),
          });
          logger.info('[ReviewController.submitCoachReview] Emitted notification_actioned event', {
            notificationId,
            userId: req.user._id,
          });
        } else {
          logger.warn('[ReviewController.submitCoachReview] Socket.IO instance unavailable', {
            notificationId,
          });
        }
      } else {
        logger.warn('[ReviewController.submitCoachReview] Notification not found or not owned', {
          notificationId,
          userId: req.user._id,
        });
      }
    }

    logger.info('[ReviewController.submitCoachReview] Review submitted successfully', {
      reviewId: review._id,
    });

    res.status(201).json(review);
  } catch (error) {
    logger.error('[ReviewController.submitCoachReview] Error:', {
      message: error.message,
      stack: error.stack,
      sessionId: req.body.sessionId,
      coachId: req.user._id,
    });
    res.status(500).json({ message: 'Failed to submit review' });
  }
};

exports.respondToReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { coachResponse } = req.body;

    if (!reviewId || reviewId === 'undefined') {
      logger.warn('[ReviewController.respondToReview] Invalid reviewId', { reviewId });
      return res.status(400).json({ message: 'Invalid review ID' });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      logger.warn('[ReviewController.respondToReview] Review not found', { reviewId });
      return res.status(404).json({ message: 'Review not found' });
    }

    review.coachResponse = coachResponse;
    await review.save();
    res.status(200).json(review);
  } catch (error) {
    logger.error('[ReviewController.respondToReview] Error:', error);
    res.status(500).json({ message: 'Failed to submit response' });
  }
};

exports.getProgramReviews = async (req, res) => {
    try {
        const { programId } = req.params;
        const reviews = await Review.find({ ratee: programId, rateeModel: 'Program', isPrivate: false, isVisible: true })
            .populate('raterId', 'firstName lastName profilePicture')
            .sort({ createdAt: -1 })
            .lean();
        
        res.status(200).json(reviews);
    } catch (error) {
        logger.error('Error fetching program reviews', { error: error.message, stack: error.stack, programId: req.params.programId });
        res.status(500).json({ message: 'Failed to fetch program reviews.' });
    }
};

exports.submitProgramReview = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { programId, rating, comment, privateFeedback } = req.body;
        const raterId = req.user._id;

         const enrollment = await Enrollment.findOne({ user: raterId, program: programId }).session(session);
        if (!enrollment) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: "You must be enrolled in this program to leave a review." });
        }

        const totalLessons = enrollment.progress.totalLessons || 0;
        const completedLessons = enrollment.progress.completedLessons.length || 0;

        if (totalLessons > 0 && completedLessons < totalLessons) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: "You must complete the program before leaving a review." });
        }
        
        const reviewData = {
            raterId,
            ratee: programId,
            rateeModel: 'Program',
            rating,
            comment,
            privateFeedback
        };

        const newOrUpdatedReview = await Review.findOneAndUpdate(
            { ratee: programId, raterId },
            { $set: reviewData },
            { new: true, upsert: true, setDefaultsOnInsert: true, session }
        );

        if (!enrollment.hasReviewed) {
             await Enrollment.updateOne(
                { _id: enrollment._id },
                { $set: { hasReviewed: true } },
                { session }
            );
        }

        const reviews = await Review.find({ ratee: programId, rateeModel: 'Program' }).session(session);
        const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        
        await Program.findByIdAndUpdate(programId, {
            averageRating: averageRating.toFixed(2),
            reviewCount: reviews.length
        }, { session });

        await session.commitTransaction();
        session.endSession();

        const program = await Program.findById(programId).populate('coach', '_id title').lean();
        const rater = await User.findById(raterId).select('firstName lastName').lean();
        
        if (program && rater && !program.coach._id.equals(raterId)) {
            const unifiedNotificationService = require('../services/unifiedNotificationService');
            const { NotificationTypes } = require('../utils/notificationHelpers');

            unifiedNotificationService.sendNotification({
                type: NotificationTypes.NEW_PROGRAM_REVIEW,
                recipient: program.coach._id,
                sender: raterId,
                metadata: {
                    programId: programId,
                    reviewId: newOrUpdatedReview._id,
                    programTitle: program.title,
                    reviewerName: `${rater.firstName} ${rater.lastName}`,
                    rating: rating
                }
            });
        }

        const updatedEnrollment = await Enrollment.findById(enrollment._id).lean();

        res.status(201).json({ review: newOrUpdatedReview, enrollment: updatedEnrollment });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        logger.error('Error submitting program review', { error: error.message, stack: error.stack, body: req.body });
        res.status(500).json({ message: 'Failed to submit review.' });
    }
};

exports.reportReview = async (req, res) => {
  const { reviewId } = req.params;
  const { reason, details } = req.body;
  const reporterId = req.user._id;

  try {
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    if (review.raterId.equals(reporterId)) {
        return res.status(400).json({ message: "You cannot report your own review." });
    }

    const alreadyFlagged = review.flags.some(flag => flag.flaggedBy.equals(reporterId));
    if (alreadyFlagged) {
      return res.status(409).json({ message: 'You have already reported this review.' });
    }

    const newFlag = {
      flaggedBy: reporterId,
      reason,
      details: details || '',
      status: 'pending',
      createdAt: new Date(),
    };

    review.flags.push(newFlag);
    await review.save();
    
    res.status(201).json({ message: 'Review reported successfully.' });

  } catch (error) {
    logger.error('Error reporting review:', { reviewId, reporterId, error: error.message });
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Invalid report data provided.', errors: error.errors });
    }
    res.status(500).json({ message: 'Server error while reporting review.' });
  }
};