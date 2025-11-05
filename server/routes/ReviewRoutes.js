const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/ReviewController');
const { auth } = require('../middleware/auth');

router.get('/coach/:coachId', reviewController.getCoachReviews);
router.post('/submit/client', auth, reviewController.submitClientReview);
router.post('/submit/coach', auth, reviewController.submitCoachReview);
router.post('/:reviewId/respond', auth, reviewController.respondToReview);
router.post('/:reviewId/report', auth, reviewController.reportReview);

router.get('/program/:programId', reviewController.getProgramReviews);
router.post('/submit/program', auth, reviewController.submitProgramReview);

module.exports = router;