import { Router } from 'express';
import { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, getCustomerCategories } from './customer.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/categories', requirePermission(PERMISSIONS.SALES_VIEW), getCustomerCategories);
router.get('/', requirePermission(PERMISSIONS.SALES_VIEW), getCustomers);
router.get('/:id', requirePermission(PERMISSIONS.SALES_VIEW), getCustomer);
router.post('/', requirePermission(PERMISSIONS.SALES_CREATE), createCustomer);
router.patch('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), updateCustomer);
router.delete('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deleteCustomer);

export default router;
