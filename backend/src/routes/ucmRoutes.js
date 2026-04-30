const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const ucmController = require('../controllers/ucmController');
const { requireFeature } = require('../middleware/licenseMiddleware');

const router = express.Router();

router.use(authMiddleware, requireRole('admin', 'supervisor'));
router.get('/debug', requireFeature('ucm_api'), ucmController.debugRaw);
router.post('/test-connection', requireFeature('ucm_api'), ucmController.testConnection);
router.post('/import', requireFeature('ucm_api'), ucmController.importCdr);

module.exports = router;
