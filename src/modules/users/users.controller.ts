import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as usersService from './users.service';
import { createUserSchema, updateUserSchema, changePasswordSchema } from './users.validator';
import { AuthRequest } from '../../common/middleware/protect';

export const getUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await usersService.getAllUsers();
  sendResponse(res, 200, { users }, 'Users fetched');
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getUserById(req.params.id);
  sendResponse(res, 200, { user }, 'User fetched');
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const data = createUserSchema.parse(req.body);
  const user = await usersService.createUser(data);
  sendResponse(res, 201, { user }, 'User created');
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const data = updateUserSchema.parse(req.body);
  const user = await usersService.updateUser(req.params.id, data);
  sendResponse(res, 200, { user }, 'User updated');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const userId = (req as AuthRequest).user!.userId;
  await usersService.changePassword(userId, currentPassword, newPassword);
  sendResponse(res, 200, null, 'Password changed successfully');
});
