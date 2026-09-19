import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { config } from '../../config';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Operational errors (AppError)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Mongoose duplicate key
  if ((err as NodeJS.ErrnoException).name === 'MongoServerError' && (err as NodeJS.ErrnoException & { code?: number }).code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists',
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    });
  }

  // Unknown errors — don't leak details in production
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    message: config.env === 'development' ? err.message : 'Internal server error',
  });
}
