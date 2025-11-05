const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const leadController = require('../controllers/leadController');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/',
  upload.array('documents'),
  [
    check('email', 'Please include a valid email').isEmail(),
    check('type', 'Lead type is required').isIn(['coach', 'client']),
  ],
  leadController.createLead
);

module.exports = router;