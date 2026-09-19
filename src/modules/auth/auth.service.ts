import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { User } from '../users/users.model';
import { AppError } from '../../common/utils/errors';

export interface TokenPayload {
  userId: string;
  role: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
}

export async function loginUser(email: string, password: string) {
  // Explicitly select password (it's excluded by default)
  const user = await User.findOne({ email, isActive: true }).select('+password');
  if (!user) throw new AppError('Invalid email or password', 401);

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new AppError('Invalid email or password', 401);

  // Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const payload: TokenPayload = { userId: String(user._id), role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { user, accessToken, refreshToken };
}
