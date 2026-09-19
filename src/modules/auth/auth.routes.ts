import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, refresh, getMe } from './auth.controller';
import { protect } from '../../common/middleware/protect';
import { config } from '../../config';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMs,
  max: config.rateLimit.loginMax,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', protect, getMe);

export default router;
