import { Router } from 'express';
import { forgotPassword, getMe, login, register, resetPassword } from '../controllers/authController.js';
import protect from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

export default router;