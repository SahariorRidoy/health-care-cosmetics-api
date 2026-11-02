import { Types } from 'mongoose';
import { Dealer } from './dealer.model';
import { Territory } from './territory.model';
import { Campaign } from './campaign.model';
import { SalesOrder } from './salesOrder.model';
import { Item } from '../inventory/item.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';
import { getDealerCampaignProgress } from './campaign.service';
import type { CreateDealerInput, UpdateDealerInput } from './dealer.validator';

const POPULATE = [
  { path: 'territory', select: 'name' },
  { path: 'campaigns', select: 'name startDate endDate prize isActive dealerTarget', match: { isActive: true } },
];

function round2(n: number) { return Math.round(n * 100) / 100; }

export async function getDealers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };
  if (query.territory && Types.ObjectId.isValid(String(query.territory))) filter.territory = query.territory;
  if (query.campaign && Types.ObjectId.isValid(String(query.campaign))) filter.campaigns = query.campaign;

  const [items, total] = await Promise.all([
    Dealer.find(filter).populate(POPULATE).sort({ name: 1 }).skip(skip).limit(limit),
    Dealer.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getDealerById(id: string) {
  const dealer = await Dealer.findById(id).populate(POPULATE);
  if (!dealer || !dealer.isActive) throw new AppError('Dealer not found', 404);
  return dealer;
}

async function validateRefs(data: UpdateDealerInput) {
  if (data.territory) {
    const t = await Territory.findById(data.territory).select('isActive');
    if (!t || !t.isActive) throw new AppError('Territory not found', 400);
  }
  if (data.campaigns && data.campaigns.length > 0) {
    const ids = [...new Set(data.campaigns)];
    const count = await Campaign.countDocuments({ _id: { $in: ids }, isActive: true });
    if (count !== ids.length) throw new AppError('One or more campaigns not found', 400);
    data.campaigns = ids;
  }
  if (data.flatPrices && data.flatPrices.length > 0) {
    const byItem = new Map(data.flatPrices.map((f) => [f.item, round2(f.price)]));
    const itemIds = [...byItem.keys()];
    const items = await Item.find({ _id: { $in: itemIds }, isActive: true }).select('type');
    if (items.length !== itemIds.length) throw new AppError('One or more flat-price items not found', 400);
    if (items.some((i) => i.type !== 'FINISHED_GOOD')) throw new AppError('Flat prices can only be set for finished goods', 400);
    data.flatPrices = itemIds.map((item) => ({ item, price: byItem.get(item) as number }));
  }
}

export async function createDealer(data: CreateDealerInput) {
  await validateRefs(data);
  const dealer = await Dealer.create(data);
  return dealer.populate(POPULATE);
}

export async function updateDealer(id: string, data: UpdateDealerInput) {
  await validateRefs(data);
  const dealer = await Dealer.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate(POPULATE);
  if (!dealer) throw new AppError('Dealer not found', 404);
  return dealer;
}

export async function deleteDealer(id: string) {
  const dealer = await Dealer.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!dealer) throw new AppError('Dealer not found', 404);
  return dealer;
}

export async function getDealerSummary(id: string) {
  const dealer = await Dealer.findById(id).populate('territory', 'name');
  if (!dealer || !dealer.isActive) throw new AppError('Dealer not found', 404);

  const now = new Date();
  const monthStart = new Date(`${new Date(now.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 7)}-01T00:00:00+06:00`);
  const base = { dealer: dealer._id, status: 'ACTIVE', isActive: true };

  const [lifetime, thisMonth, campaigns] = await Promise.all([
    SalesOrder.aggregate([
      { $match: base },
      { $group: { _id: null, sales: { $sum: '$totalAmount' }, commission: { $sum: '$totalCommission' }, orders: { $sum: 1 }, lastOrderDate: { $max: '$createdAt' } } },
    ]),
    SalesOrder.aggregate([
      { $match: { ...base, createdAt: { $gte: monthStart } } },
      { $group: { _id: null, sales: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
    ]),
    getDealerCampaignProgress(dealer._id as Types.ObjectId, dealer.campaigns as Types.ObjectId[]),
  ]);

  const life = lifetime[0];
  const month = thisMonth[0];
  return {
    outstanding: round2(dealer.balance),
    commissionRate: dealer.commissionRate,
    flatPriceCount: dealer.flatPrices.length,
    totalSales: round2(life?.sales ?? 0),
    totalCommission: round2(life?.commission ?? 0),
    orderCount: life?.orders ?? 0,
    avgOrderValue: life?.orders ? round2(life.sales / life.orders) : 0,
    lastOrderDate: life?.lastOrderDate ?? null,
    thisMonthSales: round2(month?.sales ?? 0),
    thisMonthOrders: month?.orders ?? 0,
    campaigns,
  };
}
