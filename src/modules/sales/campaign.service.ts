import { Types } from 'mongoose';
import { Campaign, ICampaignDocument, CampaignTargetMode } from './campaign.model';
import { Dealer } from './dealer.model';
import { SalesOrder } from './salesOrder.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';
import type { CreateCampaignInput, UpdateCampaignInput } from './campaign.validator';

// Business dates are Asia/Dhaka; orders are stored in UTC.
const TZ = '+06:00';
const DAY_MS = 24 * 60 * 60 * 1000;

function round2(n: number) { return Math.round(n * 100) / 100; }

function dhakaStart(ymd: string) { return new Date(`${ymd}T00:00:00${TZ}`); }
function toYmd(d: Date) { return new Date(d.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function endExclusive(endDate: Date) { return new Date(endDate.getTime() + DAY_MS); }

export function monthsBetween(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let [y, m] = startYmd.slice(0, 7).split('-').map(Number);
  const [ey, em] = endYmd.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export type CampaignStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';

function campaignStatus(c: Pick<ICampaignDocument, 'startDate' | 'endDate'>, now = new Date()): CampaignStatus {
  if (now < c.startDate) return 'UPCOMING';
  if (now >= endExclusive(c.endDate)) return 'ENDED';
  return 'ACTIVE';
}

function normalizeTargets(input: {
  startYmd: string; endYmd: string;
  targetMode: CampaignTargetMode; totalTarget: number;
  monthlyTargets: { month: string; target: number }[];
}) {
  if (input.targetMode === 'NONE') return { targetMode: 'NONE' as const, totalTarget: 0, monthlyTargets: [] };
  if (input.targetMode === 'TOTAL') {
    if (input.totalTarget <= 0) throw new AppError('Campaign target must be greater than 0', 400);
    return { targetMode: 'TOTAL' as const, totalTarget: round2(input.totalTarget), monthlyTargets: [] };
  }
  const months = monthsBetween(input.startYmd, input.endYmd);
  const byMonth = new Map(input.monthlyTargets.map((t) => [t.month, t.target]));
  const monthlyTargets = months.map((month) => ({ month, target: round2(byMonth.get(month) ?? 0) }));
  const totalTarget = round2(monthlyTargets.reduce((s, t) => s + t.target, 0));
  if (totalTarget <= 0) throw new AppError('Set a target for at least one month', 400);
  return { targetMode: 'MONTHLY' as const, totalTarget, monthlyTargets };
}

function salesMatch(dealerIds: Types.ObjectId[], start: Date, endEx: Date) {
  return {
    dealer: { $in: dealerIds },
    status: 'ACTIVE',
    isActive: true,
    createdAt: { $gte: start, $lt: endEx },
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getCampaigns(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const now = new Date();

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.name = { $regex: String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (query.status === 'ACTIVE') Object.assign(filter, { startDate: { $lte: now }, endDate: { $gt: new Date(now.getTime() - DAY_MS) } });
  if (query.status === 'UPCOMING') Object.assign(filter, { startDate: { $gt: now } });
  if (query.status === 'ENDED') Object.assign(filter, { endDate: { $lte: new Date(now.getTime() - DAY_MS) } });

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter).populate('territories', 'name').sort({ startDate: -1 }).skip(skip).limit(limit),
    Campaign.countDocuments(filter),
  ]);

  const ids = campaigns.map((c) => c._id);
  const dealers = await Dealer.find({ isActive: true, campaigns: { $in: ids } }).select('_id campaigns');

  const items = await Promise.all(campaigns.map(async (c) => {
    const dealerIds = dealers
      .filter((d) => d.campaigns.some((x) => String(x) === String(c._id)))
      .map((d) => d._id as Types.ObjectId);
    let sales = 0;
    let orders = 0;
    if (dealerIds.length > 0) {
      const [agg] = await SalesOrder.aggregate([
        { $match: salesMatch(dealerIds, c.startDate, endExclusive(c.endDate)) },
        { $group: { _id: null, sales: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]);
      sales = round2(agg?.sales ?? 0);
      orders = agg?.orders ?? 0;
    }
    return Object.assign(c.toObject(), {
      status: campaignStatus(c, now),
      stats: {
        dealerCount: dealerIds.length,
        sales,
        orders,
        achievementPct: c.totalTarget > 0 ? round2((sales / c.totalTarget) * 100) : null,
      },
    });
  }));

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getCampaignById(id: string) {
  const campaign = await Campaign.findById(id).populate('territories', 'name');
  if (!campaign || !campaign.isActive) throw new AppError('Campaign not found', 404);
  return campaign;
}

export async function createCampaign(data: CreateCampaignInput) {
  const targets = normalizeTargets({
    startYmd: data.startDate, endYmd: data.endDate,
    targetMode: data.targetMode, totalTarget: data.totalTarget, monthlyTargets: data.monthlyTargets,
  });
  const campaign = await Campaign.create({
    name: data.name,
    startDate: dhakaStart(data.startDate),
    endDate: dhakaStart(data.endDate),
    durationMonths: data.durationMonths ?? undefined,
    territories: data.territories,
    prize: data.prize,
    notes: data.notes,
    dealerTarget: round2(data.dealerTarget),
    ...targets,
  });
  return campaign.populate('territories', 'name');
}

export async function updateCampaign(id: string, data: UpdateCampaignInput) {
  const campaign = await Campaign.findById(id);
  if (!campaign || !campaign.isActive) throw new AppError('Campaign not found', 404);

  const startYmd = data.startDate ?? toYmd(campaign.startDate);
  const endYmd = data.endDate ?? toYmd(campaign.endDate);
  if (endYmd < startYmd) throw new AppError('End date must be on or after start date', 400);

  const targets = normalizeTargets({
    startYmd, endYmd,
    targetMode: data.targetMode ?? campaign.targetMode,
    totalTarget: data.totalTarget ?? campaign.totalTarget,
    monthlyTargets: data.monthlyTargets ?? campaign.monthlyTargets,
  });

  if (data.name !== undefined) campaign.name = data.name;
  if (data.prize !== undefined) campaign.prize = data.prize;
  if (data.notes !== undefined) campaign.notes = data.notes;
  if (data.territories !== undefined) campaign.territories = data.territories.map((t) => new Types.ObjectId(t));
  if (data.dealerTarget !== undefined) campaign.dealerTarget = round2(data.dealerTarget);
  if (data.durationMonths !== undefined) campaign.durationMonths = data.durationMonths ?? undefined;
  if (data.isActive !== undefined) campaign.isActive = data.isActive;
  campaign.startDate = dhakaStart(startYmd);
  campaign.endDate = dhakaStart(endYmd);
  campaign.targetMode = targets.targetMode;
  campaign.totalTarget = targets.totalTarget;
  campaign.monthlyTargets = targets.monthlyTargets;

  await campaign.save();
  return campaign.populate('territories', 'name');
}

export async function deleteCampaign(id: string) {
  const campaign = await Campaign.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!campaign) throw new AppError('Campaign not found', 404);
  return campaign;
}

export async function setCampaignDealers(id: string, dealerIds: string[]) {
  await getCampaignById(id);
  const ids = [...new Set(dealerIds)].map((d) => new Types.ObjectId(d));
  const found = await Dealer.countDocuments({ _id: { $in: ids }, isActive: true });
  if (found !== ids.length) throw new AppError('One or more dealers not found', 400);

  const campaignId = new Types.ObjectId(id);
  await Dealer.updateMany({ campaigns: campaignId, _id: { $nin: ids } }, { $pull: { campaigns: campaignId } });
  if (ids.length > 0) await Dealer.updateMany({ _id: { $in: ids } }, { $addToSet: { campaigns: campaignId } });
  return { assigned: ids.length };
}

// ── Performance ──────────────────────────────────────────────────────────────

export async function getCampaignPerformance(id: string) {
  const campaign = await getCampaignById(id);
  const now = new Date();
  const start = campaign.startDate;
  const endEx = endExclusive(campaign.endDate);
  const status = campaignStatus(campaign, now);

  const daysTotal = Math.round((endEx.getTime() - start.getTime()) / DAY_MS);
  const elapsedMs = Math.min(Math.max(now.getTime() - start.getTime(), 0), endEx.getTime() - start.getTime());
  const daysElapsed = Math.ceil(elapsedMs / DAY_MS);
  const daysLeft = Math.max(0, daysTotal - daysElapsed);

  const dealers = await Dealer.find({ isActive: true, campaigns: campaign._id })
    .select('name phone proprietor territory rsmName')
    .populate('territory', 'name');
  const dealerIds = dealers.map((d) => d._id as Types.ObjectId);

  const match = salesMatch(dealerIds, start, endEx);
  const [byDealer, byMonth] = dealerIds.length === 0 ? [[], []] : await Promise.all([
    SalesOrder.aggregate([
      { $match: match },
      { $group: {
        _id: '$dealer',
        sales: { $sum: '$totalAmount' },
        gross: { $sum: '$grossAmount' },
        orders: { $sum: 1 },
        qty: { $sum: { $sum: '$items.qty' } },
        giftQty: { $sum: { $sum: '$items.giftQty' } },
        lastOrderDate: { $max: '$createdAt' },
      } },
    ]),
    SalesOrder.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: TZ } },
        sales: { $sum: '$totalAmount' },
        orders: { $sum: 1 },
      } },
    ]),
  ]);

  const dealerStats = new Map(byDealer.map((r: { _id: Types.ObjectId }) => [String(r._id), r]));
  const dealerRows = dealers.map((d) => {
    const s = dealerStats.get(String(d._id)) as
      | { sales: number; gross: number; orders: number; qty: number; giftQty: number; lastOrderDate: Date }
      | undefined;
    const sales = round2(s?.sales ?? 0);
    const territory = d.territory as unknown as { _id: Types.ObjectId; name: string } | null;
    return {
      _id: d._id,
      name: d.name,
      proprietor: d.proprietor,
      phone: d.phone,
      rsmName: d.rsmName,
      territory: territory ? { _id: territory._id, name: territory.name } : null,
      sales,
      gross: round2(s?.gross ?? 0),
      orders: s?.orders ?? 0,
      qty: s?.qty ?? 0,
      giftQty: s?.giftQty ?? 0,
      lastOrderDate: s?.lastOrderDate ?? null,
      target: campaign.dealerTarget,
      achievementPct: campaign.dealerTarget > 0 ? round2((sales / campaign.dealerTarget) * 100) : null,
    };
  }).sort((a, b) => b.sales - a.sales).map((r, i) => ({ ...r, rank: i + 1 }));

  const totals = dealerRows.reduce((t, r) => ({
    sales: t.sales + r.sales, gross: t.gross + r.gross, orders: t.orders + r.orders,
    qty: t.qty + r.qty, giftQty: t.giftQty + r.giftQty,
  }), { sales: 0, gross: 0, orders: 0, qty: 0, giftQty: 0 });

  const target = campaign.totalTarget;
  const elapsedFraction = daysTotal > 0 ? daysElapsed / daysTotal : 0;
  const expectedToDate = round2(target * elapsedFraction);
  const projected = elapsedFraction > 0 ? round2(totals.sales / elapsedFraction) : 0;

  const months = monthsBetween(toYmd(start), toYmd(campaign.endDate));
  const monthSales = new Map(byMonth.map((r: { _id: string; sales: number; orders: number }) => [r._id, r]));
  const monthTargets = new Map(campaign.monthlyTargets.map((t) => [t.month, t.target]));
  const monthly = months.map((month) => {
    const s = monthSales.get(month) as { sales: number; orders: number } | undefined;
    const monthTarget = campaign.targetMode === 'MONTHLY'
      ? monthTargets.get(month) ?? 0
      : campaign.targetMode === 'TOTAL' ? round2(target / months.length) : 0;
    const sales = round2(s?.sales ?? 0);
    return {
      month,
      target: monthTarget,
      sales,
      orders: s?.orders ?? 0,
      achievementPct: monthTarget > 0 ? round2((sales / monthTarget) * 100) : null,
    };
  });

  const territoryMap = new Map<string, { _id: string | null; name: string; dealers: number; sales: number; orders: number }>();
  for (const r of dealerRows) {
    const key = r.territory ? String(r.territory._id) : 'none';
    const row = territoryMap.get(key) ?? { _id: r.territory ? String(r.territory._id) : null, name: r.territory?.name ?? 'Unassigned', dealers: 0, sales: 0, orders: 0 };
    row.dealers += 1;
    row.sales = round2(row.sales + r.sales);
    row.orders += r.orders;
    territoryMap.set(key, row);
  }

  return {
    campaign: Object.assign(campaign.toObject(), { status }),
    status,
    daysTotal,
    daysElapsed,
    daysLeft,
    totals: {
      sales: round2(totals.sales),
      gross: round2(totals.gross),
      orders: totals.orders,
      qty: totals.qty,
      giftQty: totals.giftQty,
      dealerCount: dealerRows.length,
      activeDealerCount: dealerRows.filter((r) => r.orders > 0).length,
      target,
      achievementPct: target > 0 ? round2((totals.sales / target) * 100) : null,
      expectedToDate,
      projected,
      remaining: target > 0 ? round2(Math.max(0, target - totals.sales)) : 0,
      requiredDailyRate: target > 0 && daysLeft > 0 ? round2(Math.max(0, target - totals.sales) / daysLeft) : 0,
    },
    monthly,
    dealers: dealerRows,
    territories: [...territoryMap.values()].sort((a, b) => b.sales - a.sales),
  };
}

// Per-dealer progress for the campaigns a dealer is assigned to.
export async function getDealerCampaignProgress(dealerId: Types.ObjectId, campaignIds: Types.ObjectId[]) {
  if (campaignIds.length === 0) return [];
  const now = new Date();
  const campaigns = await Campaign.find({ _id: { $in: campaignIds }, isActive: true }).sort({ startDate: -1 });

  return Promise.all(campaigns.map(async (c) => {
    const [agg] = await SalesOrder.aggregate([
      { $match: salesMatch([dealerId], c.startDate, endExclusive(c.endDate)) },
      { $group: { _id: null, sales: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
    ]);
    const sales = round2(agg?.sales ?? 0);
    const status = campaignStatus(c, now);
    const daysLeft = status === 'ENDED' ? 0 : Math.ceil((endExclusive(c.endDate).getTime() - Math.max(now.getTime(), c.startDate.getTime())) / DAY_MS);
    return {
      _id: c._id,
      name: c.name,
      startDate: c.startDate,
      endDate: c.endDate,
      prize: c.prize,
      status,
      daysLeft,
      sales,
      orders: agg?.orders ?? 0,
      dealerTarget: c.dealerTarget,
      achievementPct: c.dealerTarget > 0 ? round2((sales / c.dealerTarget) * 100) : null,
    };
  }));
}
