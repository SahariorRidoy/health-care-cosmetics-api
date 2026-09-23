import { Router } from 'express';
import {
  getFactoryOrders, getFactoryOrder, createFactoryOrder,
  updateFactoryOrder, dispatchMaterials, updateFactoryOrderStatus,
  receiveProducts, cancelFactoryOrder, deleteFactoryOrder,
} from './factoryOrder.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getFactoryOrders);
router.get('/:id', requirePermission(PERMISSIONS.PRODUCTION_VIEW), getFactoryOrder);
router.post('/', requirePermission(PERMISSIONS.PRODUCTION_CREATE), createFactoryOrder);
router.patch('/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), updateFactoryOrder);
router.post('/:id/dispatch', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), dispatchMaterials);
router.patch('/:id/status', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), updateFactoryOrderStatus);
router.post('/:id/receive', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), receiveProducts);
router.patch('/:id/cancel', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), cancelFactoryOrder);
router.delete('/:id', requirePermission(PERMISSIONS.PRODUCTION_UPDATE), deleteFactoryOrder);

export default router;
