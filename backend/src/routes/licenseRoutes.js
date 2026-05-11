const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const licenseService = require('../services/licenseService');

const router = express.Router();

// GET /api/license/status

router.get('/status', authMiddleware, (_req, res) => {
  res.json({ data: licenseService.getStatus() });
});

module.exports = router;
