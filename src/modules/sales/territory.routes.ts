import { Router } from 'express';
import { getTerritories, getTerritory, createTerritory, updateTerritory, deleteTerritory } from './territory.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.SALES_VIEW), getTerritories);
router.get('/:id', requirePermission(PERMISSIONS.SALES_VIEW), getTerritory);
router.post('/', requirePermission(PERMISSIONS.SALES_CREATE), createTerritory);
router.patch('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), updateTerritory);
router.delete('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deleteTerritory);

export default router;
