import { Router } from 'express';
import { getItems, getItem, createItem, updateItem, deleteItem, generateSku, repurchaseItem, bulkPurchaseItems } from './item.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/generate-sku', requirePermission(PERMISSIONS.INVENTORY_VIEW), generateSku);
router.get('/', requirePermission(PERMISSIONS.INVENTORY_VIEW), getItems);
router.get('/:id', requirePermission(PERMISSIONS.INVENTORY_VIEW), getItem);
router.post('/', requirePermission(PERMISSIONS.INVENTORY_CREATE), createItem);
router.post('/bulk-purchase', requirePermission(PERMISSIONS.INVENTORY_CREATE), bulkPurchaseItems);
router.post('/:id/repurchase', requirePermission(PERMISSIONS.INVENTORY_CREATE), repurchaseItem);
router.patch('/:id', requirePermission(PERMISSIONS.INVENTORY_UPDATE), updateItem);
router.delete('/:id', requirePermission(PERMISSIONS.INVENTORY_DELETE), deleteItem);

export default router;
