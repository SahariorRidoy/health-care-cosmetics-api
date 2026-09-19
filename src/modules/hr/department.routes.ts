import { Router } from 'express';
import {
  getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment,
} from './department.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.HR_VIEW), getDepartments);
router.get('/:id', requirePermission(PERMISSIONS.HR_VIEW), getDepartment);
router.post('/', requirePermission(PERMISSIONS.HR_CREATE), createDepartment);
router.patch('/:id', requirePermission(PERMISSIONS.HR_UPDATE), updateDepartment);
router.delete('/:id', requirePermission(PERMISSIONS.HR_CREATE), deleteDepartment);

export default router;
