const express = require('express');
const router = express.Router();
const multer = require('multer');
const { auth } = require('../middleware/auth');
const uploadController = require('../controllers/uploadController');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/', auth, upload.single('file'), uploadController.handleFileUpload);

module.exports = router;