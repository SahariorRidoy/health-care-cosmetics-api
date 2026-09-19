import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import { AuthRequest } from '../../common/middleware/protect';
import * as departmentService from './department.service';
import { createDepartmentSchema, updateDepartmentSchema } from './department.validator';

export const getDepartments = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await departmentService.getDepartments(req.query as Record<string, unknown>);
  sendResponse(res, 200, { departments: items }, 'Departments fetched', pagination);
});

export const getDepartment = asyncHandler(async (req: Request, res: Response) => {
  const dept = await departmentService.getDepartmentById(req.params.id);
  sendResponse(res, 200, { department: dept }, 'Department fetched');
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const data = createDepartmentSchema.parse(req.body);
  const dept = await departmentService.createDepartment(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { department: dept }, 'Department created');
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const data = updateDepartmentSchema.parse(req.body);
  const dept = await departmentService.updateDepartment(req.params.id, data);
  sendResponse(res, 200, { department: dept }, 'Department updated');
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  await departmentService.deleteDepartment(req.params.id);
  sendResponse(res, 200, null, 'Department deactivated');
});
