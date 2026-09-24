import { Router } from 'express';
import {
  getFactoryBatches, getFactoryBatch, getFactoryLedger,
  createFactoryBatch, updateFactoryBatch, dispatchMaterials,
  updateStatus, addReceipt, addMaterialReturn, restockBatch,
  cancelFactoryBatch, deleteFactoryBatch,
} from './factoryBatch.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getFactoryBatches);
router.get('/factory/:factoryId', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getFactoryLedger);
router.get('/:id', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getFactoryBatch);
router.post('/', requirePermission(PERMISSIONS.PRODUCTION_CREATE), createFactoryBatch);
router.patch('/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), updateFactoryBatch);
router.post('/:id/dispatch', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), dispatchMaterials);
router.patch('/:id/status', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), updateStatus);
router.post('/:id/receipts', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), addReceipt);
router.post('/:id/returns', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), addMaterialReturn);
router.post('/:id/restock', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), restockBatch);
router.patch('/:id/cancel', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), cancelFactoryBatch);
router.delete('/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), deleteFactoryBatch);

export default router;
