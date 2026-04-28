const express = require('express');
const cdrController = require('../controllers/cdrController');

const router = express.Router();

router.get('/cdr', cdrController.getCdrRecords);
router.get('/stats', cdrController.getStats);
router.post('/cdr/mock', cdrController.createMockCdr);

module.exports = router;
