import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import { loginUser, verifyRefreshToken, generateAccessToken } from './auth.service';
import { AppError } from '../../common/utils/errors';
import { User } from '../users/users.model';
import { loginSchema } from './auth.validator';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await loginUser(email, password);

  res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
  sendResponse(res, 200, { user, accessToken }, 'Login successful');
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE);
  sendResponse(res, 200, null, 'Logged out successfully');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new AppError('No refresh token', 401);

  const payload = verifyRefreshToken(token);
  const user = await User.findById(payload.userId);
  if (!user || !user.isActive) throw new AppError('User not found or inactive', 401);

  const accessToken = generateAccessToken({ userId: String(user._id), role: user.role });
  sendResponse(res, 200, { accessToken }, 'Token refreshed');
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById((req as Request & { user?: { userId: string } }).user?.userId);
  if (!user) throw new AppError('User not found', 404);
  sendResponse(res, 200, { user }, 'User fetched');
});
