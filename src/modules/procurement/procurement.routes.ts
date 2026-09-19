import { Router } from 'express';
import {
  getGoodsReceipts, getGoodsReceipt, createGoodsReceipt,
  createSupplierPayment, getSupplierPayments, getSupplierDues,
} from './procurement.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

// Goods receipts
router.get('/receipts', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getGoodsReceipts);
router.get('/receipts/:id', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getGoodsReceipt);
router.post('/receipts', requirePermission(PERMISSIONS.PROCUREMENT_CREATE), createGoodsReceipt);

// Supplier payments
router.post('/payments', requirePermission(PERMISSIONS.PROCUREMENT_CREATE), createSupplierPayment);
router.get('/suppliers/:supplierId/payments', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getSupplierPayments);
router.get('/suppliers/:supplierId/dues', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getSupplierDues);

export default router;
