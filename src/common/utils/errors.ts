export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const createError = (message: string, statusCode: number) =>
  new AppError(message, statusCode);

export const NotFoundError = (resource: string) =>
  new AppError(`${resource} not found`, 404);

export const UnauthorizedError = (message = 'Unauthorized') =>
  new AppError(message, 401);

export const ForbiddenError = (message = 'Forbidden') =>
  new AppError(message, 403);

export const ValidationError = (message: string) =>
  new AppError(message, 400);

export const ConflictError = (message: string) =>
  new AppError(message, 409);
