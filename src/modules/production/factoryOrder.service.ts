import mongoose from 'mongoose';
import { FactoryOrder } from './factoryOrder.model';
import { Item } from '../inventory/item.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from '../inventory/stock.service';
import { generateSKU } from '../inventory/item.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

async function generateFONumber(): Promise<string> {
  const date = new Date();
  const prefix = `FO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await FactoryOrder.countDocuments({ foNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function calcTotalMaterialCost(materials: { item: string; qty: number }[]): Promise<number> {
  let total = 0;
  for (const mat of materials) {
    const itemDoc = await Item.findById(mat.item).select('costPrice');
    if (itemDoc && itemDoc.costPrice > 0) {
      total += mat.qty * itemDoc.costPrice;
    }
  }
  return Math.round(total * 100) / 100;
}

export async function getFactoryOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const regex = { $regex: String(query.search), $options: 'i' };
    filter.$or = [{ foNumber: regex }, { orderName: regex }];
  }

  const [items, total] = await Promise.all([
    FactoryOrder.find(filter)
      .populate('warehouse', 'name code')
      .populate('expectedProducts.uom', 'symbol')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    FactoryOrder.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getFactoryOrderById(id: string) {
  const order = await FactoryOrder.findById(id)
    .populate('warehouse', 'name code')
    .populate('materials.item', 'name sku costPrice')
    .populate('materials.uom', 'name symbol')
    .populate('expectedProducts.uom', 'name symbol')
    .populate('expectedProducts.linkedItem', 'name sku')
    .populate('createdBy', 'name');
  if (!order || !order.isActive) throw new AppError('Factory order not found', 404);
  return order;
}

export async function createFactoryOrder(data: {
  orderName: string;
  warehouse: string;
  materials: { item: string; qty: number; uom: string }[];
  expectedProducts: { name: string; expectedQty: number; uom: string }[];
  serviceCharge?: number;
  expectedDeliveryDate?: string;
  notes?: string;
}, createdBy: string) {
  const warehouse = await Warehouse.findById(data.warehouse);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  for (const mat of data.materials) {
    const itemDoc = await Item.findById(mat.item);
    if (!itemDoc || !itemDoc.isActive) throw new AppError(`Material item not found: ${mat.item}`, 404);
    if (!['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED'].includes(itemDoc.type)) {
      throw new AppError(`Item "${itemDoc.name}" is not a raw material or packaging item`, 400);
    }
  }

  const serviceCharge = data.serviceCharge ?? 0;
  const totalMaterialCost = await calcTotalMaterialCost(data.materials);
  const totalCost = Math.round((totalMaterialCost + serviceCharge) * 100) / 100;
  const foNumber = await generateFONumber();

  return FactoryOrder.create({
    foNumber,
    orderName: data.orderName,
    warehouse: data.warehouse,
    materials: data.materials.map((m) => ({ item: m.item, qty: m.qty, uom: m.uom, dispatchedQty: 0 })),
    expectedProducts: data.expectedProducts.map((p) => ({
      name: p.name,
      expectedQty: p.expectedQty,
      uom: p.uom,
      receivedQty: 0,
    })),
    serviceCharge,
    totalMaterialCost,
    totalCost,
    expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
    notes: data.notes,
    createdBy,
  });
}

export async function updateFactoryOrder(id: string, data: {
  orderName?: string;
  warehouse?: string;
  materials?: { item: string; qty: number; uom: string }[];
  expectedProducts?: { name: string; expectedQty: number; uom: string }[];
  serviceCharge?: number;
  expectedDeliveryDate?: string;
  notes?: string;
}) {
  const order = await FactoryOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Factory order not found', 404);
  if (order.status !== 'DRAFT') throw new AppError('Only DRAFT factory orders can be edited', 400);

  if (data.orderName !== undefined) order.orderName = data.orderName;
  if (data.warehouse !== undefined) {
    const warehouse = await Warehouse.findById(data.warehouse);
    if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);
    order.warehouse = data.warehouse as unknown as typeof order.warehouse;
  }
  if (data.materials !== undefined) {
    order.materials = data.materials.map((m) => ({
      item: m.item as unknown as typeof order.materials[0]['item'],
      qty: m.qty,
      uom: m.uom as unknown as typeof order.materials[0]['uom'],
      dispatchedQty: 0,
    }));
    order.totalMaterialCost = await calcTotalMaterialCost(data.materials);
  }
  if (data.expectedProducts !== undefined) {
    order.expectedProducts = data.expectedProducts.map((p) => ({
      name: p.name,
      expectedQty: p.expectedQty,
      uom: p.uom as unknown as typeof order.expectedProducts[0]['uom'],
      receivedQty: 0,
    }));
  }
  if (data.serviceCharge !== undefined) order.serviceCharge = data.serviceCharge;
  if (data.expectedDeliveryDate !== undefined) {
    order.expectedDeliveryDate = new Date(data.expectedDeliveryDate);
  }
  if (data.notes !== undefined) order.notes = data.notes;

  order.totalCost = Math.round((order.totalMaterialCost + order.serviceCharge) * 100) / 100;
  return order.save();
}

export async function dispatchMaterials(id: string, createdBy: string) {
  const order = await FactoryOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Factory order not found', 404);
  if (order.status !== 'DRAFT') throw new AppError('Only DRAFT orders can be dispatched', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const mat of order.materials) {
      await postMovement({
        type: 'FACTORY_DISPATCH',
        item: String(mat.item),
        warehouse: String(order.warehouse),
        quantity: -mat.qty,
        reference: order.foNumber,
        referenceModel: 'FactoryOrder',
        referenceId: String(order._id),
        notes: `Materials dispatched to factory for ${order.foNumber} — ${order.orderName}`,
        createdBy,
        session,
      });

      await FactoryOrder.updateOne(
        { _id: id, 'materials.item': mat.item },
        { $set: { 'materials.$.dispatchedQty': mat.qty } },
        { session },
      );
    }

    order.status = 'DISPATCHED';
    order.dispatchedDate = new Date();
    await order.save({ session });

    await session.commitTransaction();
    return getFactoryOrderById(id);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function updateFactoryOrderStatus(id: string, newStatus: 'IN_PRODUCTION') {
  const order = await FactoryOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Factory order not found', 404);
  if (order.status !== 'DISPATCHED') {
    throw new AppError('Order must be DISPATCHED to mark as IN_PRODUCTION', 400);
  }
  order.status = newStatus;
  await order.save();
  return getFactoryOrderById(id);
}

export async function receiveProducts(id: string, data: {
  products: {
    expectedProductIndex: number;
    actualQty: number;
    linkedItem?: string;
    newProduct?: {
      name: string;
      sku?: string;
      salePrice?: number;
      baseUom: string;
      reorderLevel?: number;
    };
  }[];
}, createdBy: string) {
  const order = await FactoryOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Factory order not found', 404);
  if (!['DISPATCHED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED'].includes(order.status)) {
    throw new AppError('Order must be DISPATCHED, IN_PRODUCTION, or PARTIALLY_RECEIVED to receive products', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const line of data.products) {
      const { expectedProductIndex, actualQty, linkedItem, newProduct } = line;
      const expectedProd = order.expectedProducts[expectedProductIndex];
      if (!expectedProd) throw new AppError(`Expected product at index ${expectedProductIndex} not found`, 400);
      if (actualQty <= 0) continue;

      let itemId: string;

      if (expectedProd.linkedItem) {
        // Already linked from a previous partial receive — always reuse it
        itemId = String(expectedProd.linkedItem);
      } else if (linkedItem) {
        // Map to existing product
        const existingItem = await Item.findById(linkedItem).session(session);
        if (!existingItem || !existingItem.isActive) throw new AppError(`Item ${linkedItem} not found`, 404);
        itemId = linkedItem;
      } else if (newProduct) {
        // Create new FINISHED_GOOD item
        const sku = newProduct.sku
          ? newProduct.sku.toUpperCase()
          : await generateSKU(newProduct.name);
        const skuExists = await Item.findOne({ sku }).session(session);
        if (skuExists) throw new AppError(`SKU "${sku}" already exists`, 409);

        const [created] = await Item.create(
          [{
            name: newProduct.name,
            sku,
            type: 'FINISHED_GOOD',
            baseUom: newProduct.baseUom,
            salePrice: newProduct.salePrice,
            reorderLevel: newProduct.reorderLevel ?? 0,
            costPrice: 0,
            createdBy,
          }],
          { session },
        );
        itemId = String(created._id);
      } else {
        throw new AppError(`Product "${expectedProd.name}" needs either a linkedItem or newProduct`, 400);
      }

      await postMovement({
        type: 'FACTORY_RECEIPT',
        item: itemId,
        warehouse: String(order.warehouse),
        quantity: actualQty,
        reference: order.foNumber,
        referenceModel: 'FactoryOrder',
        referenceId: String(order._id),
        notes: `Factory receipt for ${order.foNumber} — ${expectedProd.name}`,
        createdBy,
        session,
      });

      // Update receivedQty and linkedItem on the expected product
      await FactoryOrder.updateOne(
        { _id: id },
        {
          $inc: { [`expectedProducts.${expectedProductIndex}.receivedQty`]: actualQty },
          $set: { [`expectedProducts.${expectedProductIndex}.linkedItem`]: itemId },
        },
        { session },
      );
    }

    // Reload to get updated receivedQty values
    const updated = await FactoryOrder.findById(id).session(session);
    if (!updated) throw new AppError('Factory order not found after update', 500);

    // Calculate cost per unit across all received products
    const totalReceived = updated.expectedProducts.reduce((s, p) => s + p.receivedQty, 0);
    if (totalReceived > 0) {
      const costPerUnit = Math.round((updated.totalCost / totalReceived) * 100) / 100;
      // Update costPrice on all linked items
      const linkedItemIds = [...new Set(
        updated.expectedProducts
          .filter((p) => p.linkedItem)
          .map((p) => String(p.linkedItem)),
      )];
      for (const liId of linkedItemIds) {
        await Item.findByIdAndUpdate(liId, { costPrice: costPerUnit }, { session });
      }
    }

    // Determine new status
    const allReceived = updated.expectedProducts.every((p) => p.receivedQty >= p.expectedQty);
    updated.status = allReceived ? 'COMPLETED' : 'PARTIALLY_RECEIVED';
    await updated.save({ session });

    await session.commitTransaction();
    return getFactoryOrderById(id);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function cancelFactoryOrder(id: string, createdBy: string) {
  const order = await FactoryOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Factory order not found', 404);
  if (!['DRAFT', 'DISPATCHED'].includes(order.status)) {
    throw new AppError('Only DRAFT or DISPATCHED orders can be cancelled', 400);
  }

  if (order.status === 'DISPATCHED') {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      for (const mat of order.materials) {
        if (mat.dispatchedQty > 0) {
          await postMovement({
            type: 'FACTORY_DISPATCH',
            item: String(mat.item),
            warehouse: String(order.warehouse),
            quantity: mat.dispatchedQty,   // positive = return to stock
            reference: order.foNumber,
            referenceModel: 'FactoryOrder',
            referenceId: String(order._id),
            notes: `Cancellation reversal for ${order.foNumber}`,
            createdBy,
            session,
          });
        }
      }
      order.status = 'CANCELLED';
      await order.save({ session });
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } else {
    order.status = 'CANCELLED';
    await order.save();
  }

  return getFactoryOrderById(id);
}

export async function deleteFactoryOrder(id: string) {
  const order = await FactoryOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Factory order not found', 404);
  if (order.status !== 'DRAFT') throw new AppError('Only DRAFT factory orders can be deleted', 400);
  order.isActive = false;
  return order.save();
}
