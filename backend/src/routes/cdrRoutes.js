const express = require('express');
const multer = require('multer');
const cdrController = require('../controllers/cdrController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const upload = multer();
const router = express.Router();

router.use(authMiddleware);
router.get('/cdr', cdrController.listCdr);
router.get('/stats', cdrController.stats);
router.post('/cdr/mock', requireRole('admin', 'supervisor'), cdrController.mock);
router.post('/import/cdr', requireRole('admin', 'supervisor'), upload.single('file'), cdrController.importCsv);
router.get('/export/cdr', cdrController.exportCsv);

module.exports = router;
