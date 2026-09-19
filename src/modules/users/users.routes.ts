import { Router } from 'express';
import { getUsers, getUser, createUser, updateUser, changePassword } from './users.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();

router.use(protect);

router.get('/', requirePermission(PERMISSIONS.USERS_MANAGE), getUsers);
router.get('/:id', requirePermission(PERMISSIONS.USERS_MANAGE), getUser);
router.post('/', requirePermission(PERMISSIONS.USERS_MANAGE), createUser);
router.patch('/:id', requirePermission(PERMISSIONS.USERS_MANAGE), updateUser);
router.patch('/me/change-password', changePassword); // any logged-in user

export default router;
