import { Router } from 'express';
import {
  getPurchaseOrders, getPurchaseOrder, createPurchaseOrder,
  updatePurchaseOrder, updatePOStatus, deletePurchaseOrder, updatePOPayment,
} from './purchaseOrder.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getPurchaseOrders);
router.get('/:id', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getPurchaseOrder);
router.post('/', requirePermission(PERMISSIONS.PROCUREMENT_CREATE), createPurchaseOrder);
router.patch('/:id', requirePermission(PERMISSIONS.PROCUREMENT_UPDATE), updatePurchaseOrder);
router.patch('/:id/status', requirePermission(PERMISSIONS.PROCUREMENT_UPDATE), updatePOStatus);
router.patch('/:id/payment', requirePermission(PERMISSIONS.PROCUREMENT_UPDATE), updatePOPayment);
router.delete('/:id', requirePermission(PERMISSIONS.PROCUREMENT_UPDATE), deletePurchaseOrder);

export default router;
