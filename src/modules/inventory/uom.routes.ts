import { Router } from 'express';
import {
  getUOMs, getUOM, createUOM, updateUOM, deleteUOM,
  getConversions, createConversion, updateConversion, deleteConversion,
} from './uom.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

// UOM routes
router.get('/', requirePermission(PERMISSIONS.INVENTORY_VIEW), getUOMs);
router.get('/:id', requirePermission(PERMISSIONS.INVENTORY_VIEW), getUOM);
router.post('/', requirePermission(PERMISSIONS.SETTINGS_MANAGE), createUOM);
router.patch('/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), updateUOM);
router.delete('/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), deleteUOM);

// Conversion routes
router.get('/conversions/list', requirePermission(PERMISSIONS.INVENTORY_VIEW), getConversions);
router.post('/conversions', requirePermission(PERMISSIONS.SETTINGS_MANAGE), createConversion);
router.patch('/conversions/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), updateConversion);
router.delete('/conversions/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), deleteConversion);

export default router;
