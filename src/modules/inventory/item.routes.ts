import { Router } from 'express';
import { getItems, getItem, createItem, updateItem, deleteItem, getCategories } from './item.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/categories', requirePermission(PERMISSIONS.INVENTORY_VIEW), getCategories);
router.get('/', requirePermission(PERMISSIONS.INVENTORY_VIEW), getItems);
router.get('/:id', requirePermission(PERMISSIONS.INVENTORY_VIEW), getItem);
router.post('/', requirePermission(PERMISSIONS.INVENTORY_CREATE), createItem);
router.patch('/:id', requirePermission(PERMISSIONS.INVENTORY_UPDATE), updateItem);
router.delete('/:id', requirePermission(PERMISSIONS.INVENTORY_DELETE), deleteItem);

export default router;
