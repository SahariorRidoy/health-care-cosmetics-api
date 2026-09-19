import { Response, NextFunction } from 'express';
import { AuthRequest } from './protect';
import { ROLE_PERMISSIONS, Permission } from '../../modules/permissions/permissions.constants';
import { AppError } from '../utils/errors';

export function requirePermission(permission: Permission) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));

    const rolePerms = ROLE_PERMISSIONS[req.user.role] ?? [];
    if (!rolePerms.includes(permission)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
}
