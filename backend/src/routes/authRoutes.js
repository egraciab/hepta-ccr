const express = require('express');
const authController = require('../controllers/authController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/register', authMiddleware, requireRole('admin'), authController.register);

module.exports = router;
