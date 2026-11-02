import { Router } from 'express';
import {
  getCampaigns, getCampaign, getCampaignPerformance,
  createCampaign, updateCampaign, setCampaignDealers, deleteCampaign,
} from './campaign.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.SALES_VIEW), getCampaigns);
router.get('/:id', requirePermission(PERMISSIONS.SALES_VIEW), getCampaign);
router.get('/:id/performance', requirePermission(PERMISSIONS.SALES_VIEW), getCampaignPerformance);
router.post('/', requirePermission(PERMISSIONS.SALES_CREATE), createCampaign);
router.patch('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), updateCampaign);
router.put('/:id/dealers', requirePermission(PERMISSIONS.SALES_UPDATE), setCampaignDealers);
router.delete('/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deleteCampaign);

export default router;
