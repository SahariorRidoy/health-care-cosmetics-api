import { Router } from 'express';
import { getStockBalances, getStockMovements, createAdjustment } from './stock.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/balance', requirePermission(PERMISSIONS.INVENTORY_VIEW), getStockBalances);
router.get('/movements', requirePermission(PERMISSIONS.INVENTORY_VIEW), getStockMovements);
router.post('/adjustments', requirePermission(PERMISSIONS.STOCK_ADJUST), createAdjustment);

export default router;
