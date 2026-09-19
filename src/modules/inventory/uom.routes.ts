import { Router } from 'express';
import { getUOMs, getUOM, createUOM, updateUOM, deleteUOM } from './uom.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.INVENTORY_VIEW), getUOMs);
router.get('/:id', requirePermission(PERMISSIONS.INVENTORY_VIEW), getUOM);
router.post('/', requirePermission(PERMISSIONS.INVENTORY_CREATE), createUOM);
router.patch('/:id', requirePermission(PERMISSIONS.INVENTORY_UPDATE), updateUOM);
router.delete('/:id', requirePermission(PERMISSIONS.INVENTORY_DELETE), deleteUOM);

export default router;
