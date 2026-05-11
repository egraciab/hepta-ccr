const express = require('express');
const settingController = require('../controllers/settingController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware, requireRole('admin'));
router.get('/', settingController.list);
router.put('/', settingController.upsert);

module.exports = router;
