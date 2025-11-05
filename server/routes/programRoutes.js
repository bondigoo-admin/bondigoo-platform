const express = require('express');
const router = express.Router();
router.use((req, res, next) => {
  console.log(`[PROGRAM_ROUTER] Received request: ${req.method} ${req.originalUrl}`);
  next();
});
const programController = require('../controllers/programController');
const { auth, isCoach } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { createContentLimiter } = require('../middleware/rateLimiter');
const { validateComment, handleValidationErrors } = require('../middleware/validators');

router.post('/upload-signature', [auth, isCoach], programController.getUploadSignature);

// === Specific Routes (MUST come before parameterized routes) ===
router.get('/coach/my-programs', [auth, isCoach], programController.getCoachPrograms);
router.get('/coach/:coachId', auth, programController.getProgramsByCoachId);
router.get('/enrollments/my-programs', auth, programController.getUserEnrollments);
router.get('/learning-outcomes', programController.getUniqueLearningOutcomes);
router.get('/authors', programController.getProgramAuthors);
router.get('/categories', auth, programController.getProgramCategories);
router.get('/lessons/:lessonId/comments', auth, programController.getComments);
router.get('/lessons/:lessonId/submission', auth, programController.getAssignmentSubmission);
router.get('/', programController.getPublishedPrograms);


// === Coach-Specific Creation/Modification Routes ===
router.post('/', [auth, isCoach], programController.createProgram);
router.put('/:programId', [auth, isCoach], programController.updateProgramDetails);
router.delete('/:programId', [auth, isCoach], programController.deleteProgram);
router.get('/:programId/enrollments', [auth, isCoach], programController.getProgramEnrollments);
router.get('/:programId/submissions', [auth, isCoach], programController.getProgramSubmissions);
router.get('/:programId/qa', [auth, isCoach], programController.getProgramQandA);

router.post('/:programId/modules', [auth, isCoach], programController.addModule);
router.put('/modules/:moduleId', [auth, isCoach], programController.updateModule);
router.delete('/:programId/modules/:moduleId', [auth, isCoach], programController.deleteModule);

router.post('/modules/:moduleId/lessons', [auth, isCoach], programController.addLesson);
router.put('/lessons/:lessonId', [auth, isCoach], programController.updateLesson);
router.delete('/modules/:moduleId/lessons/:lessonId', [auth, isCoach], programController.deleteLesson);

router.post(
    '/lessons/:lessonId/slides/:slideId/audio', 
    [auth, isCoach], 
    programController.addAudioToSlide
);

router.delete(
    '/lessons/:lessonId/slides/:slideId/audio',
    [auth, isCoach],
    programController.deleteAudioFromSlide
);

router.put(
    '/lessons/:lessonId/slides/:slideId/audio/trim',
    [auth, isCoach],
    programController.trimAudioOnSlide
);

router.put(
    '/lessons/:lessonId/slides/:slideId/enhancements',
    [auth, isCoach],
    programController.updateSlideEnhancements
);


// === User/Client Interaction Routes (often parameterized) ===
router.post('/:programId/enroll', auth, programController.enrollInProgram);
router.post('/enrollments/:enrollmentId/progress', auth, programController.updateUserProgress);
router.post('/enrollments/:enrollmentId/lessons/:lessonId/submit', auth, programController.submitLesson);

router.post(
    '/enrollments/:enrollmentId/lessons/:lessonId/notes', 
    auth, 
    programController.savePresentationNotes
);

router.post(
    '/enrollments/:enrollmentId/lessons/:lessonId/presentation-progress',
    auth,
    programController.updatePresentationProgress
);

router.post(
    '/lessons/:lessonId/comments', 
    [auth, createContentLimiter, ...validateComment, handleValidationErrors], 
    programController.postComment
);

router.put(
    '/comments/:commentId', 
    [auth, ...validateComment, handleValidationErrors], 
    programController.updateComment
);
router.delete(
    '/comments/:commentId', 
    auth, 
    programController.deleteComment
);

router.delete('/lessons/:lessonId/submission', auth, programController.deleteAssignmentSubmission);
router.delete('/lessons/:lessonId/submission/file/:publicId(*)', auth, programController.deleteAssignmentSubmissionFile);


// === General Access / Parameterized GET Routes (Place Last) ===
router.get('/:programId', optionalAuth, programController.getProgramLandingPage);
router.get('/:programId/content', auth, programController.getProgramContent);


module.exports = router;