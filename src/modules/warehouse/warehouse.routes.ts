import { Router } from 'express';
import { getWarehouses, getWarehouse, createWarehouse, updateWarehouse } from './warehouse.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.INVENTORY_VIEW), getWarehouses);
router.get('/:id', requirePermission(PERMISSIONS.INVENTORY_VIEW), getWarehouse);
router.post('/', requirePermission(PERMISSIONS.SETTINGS_MANAGE), createWarehouse);
router.patch('/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), updateWarehouse);

export default router;
