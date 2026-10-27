import { Router } from 'express';
import { getSuppliers, getSupplierSummary, getSupplier, createSupplier, updateSupplier, deleteSupplier } from './supplier.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getSuppliers);
router.get('/summary', requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getSupplierSummary);
router.get('/:id',requirePermission(PERMISSIONS.PROCUREMENT_VIEW), getSupplier);
router.post('/', requirePermission(PERMISSIONS.PROCUREMENT_CREATE), createSupplier);
router.patch('/:id', requirePermission(PERMISSIONS.PROCUREMENT_UPDATE), updateSupplier);
router.delete('/:id', requirePermission(PERMISSIONS.PROCUREMENT_UPDATE), deleteSupplier);

export default router;
