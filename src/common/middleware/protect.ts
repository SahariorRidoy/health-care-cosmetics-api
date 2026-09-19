import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../../modules/auth/auth.service';
import { AppError } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function protect(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).user = payload;
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}
