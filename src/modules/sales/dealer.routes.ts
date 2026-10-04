import { Router } from 'express';
import { getDealers, getDealer, createDealer, updateDealer, deleteDealer } from './dealer.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.SALES_VIEW), getDealers);
router.get('/:id', requirePermission(PERMISSIONS.SALES_VIEW), getDealer);
router.post('/', requirePermission(PERMISSIONS.SALES_CREATE), createDealer);
router.patch('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), updateDealer);
router.delete('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deleteDealer);

export default router;
