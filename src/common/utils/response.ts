import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function sendResponse<T>(
  res: Response,
  statusCode: number,
  data: T,
  message = 'Success',
  pagination?: PaginationMeta,
) {
  res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(pagination && { pagination }),
  });
}

export function buildPagination(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

export function parsePagination(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10)));
  return { page, limit, skip: (page - 1) * limit };
}
