const express = require('express');
const agentController = require('../controllers/agentController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.get('/', agentController.list);
router.put('/:id', requireRole('admin', 'supervisor'), agentController.update);

module.exports = router;
