const express = require('express');
const multer = require('multer');
const cdrController = require('../controllers/cdrController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const { requireFeature, blockWhenRestricted } = require('../middleware/licenseMiddleware');

const upload = multer();
const router = express.Router();

router.use(authMiddleware);
router.get('/cdr', cdrController.listCdr);
router.get('/stats', cdrController.stats);
router.post('/cdr/mock', requireRole('admin', 'supervisor'), cdrController.mock);
router.post('/cdr/reset', requireRole('admin'), cdrController.reset);
router.post('/import/cdr', requireRole('admin', 'supervisor'), blockWhenRestricted, requireFeature('import'), upload.single('file'), cdrController.importCsv);
router.get('/export/cdr', blockWhenRestricted, requireFeature('export'), cdrController.exportCsv);
router.get('/export/cdr/xlsx', blockWhenRestricted, requireFeature('export'), cdrController.exportXlsx);
router.get('/export/cdr/pdf', blockWhenRestricted, requireFeature('export'), cdrController.exportPdf);

module.exports = router;
