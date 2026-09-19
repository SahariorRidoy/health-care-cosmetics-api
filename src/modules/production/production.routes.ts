import { Router } from 'express';
import {
  getBOMs, getBOM, createBOM, updateBOM, deleteBOM,
  getProductionOrders, getProductionOrder, createProductionOrder,
  updateProductionOrder, updateProductionStatus, deleteProductionOrder,
  issueMaterials, recordOutput, checkAvailability,
} from './production.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

// BOM
router.get('/boms', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getBOMs);
router.get('/boms/:id', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getBOM);
router.post('/boms', requirePermission(PERMISSIONS.PRODUCTION_CREATE), createBOM);
router.patch('/boms/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), updateBOM);
router.delete('/boms/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), deleteBOM);

// Availability check
router.get('/availability', requirePermission(PERMISSIONS.PRODUCTION_VIEW), checkAvailability);

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
