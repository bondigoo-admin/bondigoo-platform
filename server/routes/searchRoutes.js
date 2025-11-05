const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { auth } = require('../middleware/auth');

router.get('/', auth, searchController.globalSearch);
router.get('/suggest', searchController.getSearchSuggestions);
router.get('/coaches', searchController.searchCoaches);
router.get('/coaches/facets', auth, searchController.getCoachFacets);
router.get('/programs', searchController.searchPrograms);

module.exports = router;