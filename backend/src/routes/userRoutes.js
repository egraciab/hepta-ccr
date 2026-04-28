const express = require('express');
const userController = require('../controllers/userController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware, requireRole('admin'));
router.get('/', userController.list);
router.post('/', userController.create);
router.delete('/:id', userController.remove);

module.exports = router;
