import { Router } from 'express';
import {
  getProductionBatches, createProductionBatch,
  getProductionOrders, getProductionOrder, createProductionOrder,
  updateProductionOrder, updateProductionStatus, deleteProductionOrder,
  issueMaterials, recordOutput,
} from './production.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/batches', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getProductionBatches);
router.post('/batches', requirePermission(PERMISSIONS.PRODUCTION_CREATE), createProductionBatch);

// Production Orders
router.get('/orders', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getProductionOrders);
router.get('/orders/:id', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getProductionOrder);
router.post('/orders', requirePermission(PERMISSIONS.PRODUCTION_CREATE), createProductionOrder);
router.patch('/orders/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), updateProductionOrder);
router.patch('/orders/:id/status', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), updateProductionStatus);
router.delete('/orders/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), deleteProductionOrder);

// Material issue + output
router.post('/orders/:id/issue', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), issueMaterials);
router.post('/orders/:id/output', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), recordOutput);

export default router;
