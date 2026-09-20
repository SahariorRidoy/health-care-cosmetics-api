import mongoose from 'mongoose';
import { GoodsReceipt } from './goodsReceipt.model';
import { SupplierPayment } from './supplierPayment.model';
import { PurchaseOrder } from './purchaseOrder.model';
import { Supplier } from './supplier.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { Batch } from '../inventory/batch.model';
import { Item } from '../inventory/item.model';
import { postMovement } from '../inventory/stock.service';
import { convertQty } from '../inventory/uom.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

async function generateGRNumber(): Promise<string> {
  const date = new Date();
  const prefix = `GR-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await GoodsReceipt.countDocuments({ grNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function generatePaymentNumber(): Promise<string> {
  const date = new Date();
  const prefix = `PAY-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const count = await SupplierPayment.countDocuments({ paymentNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// ── Goods Receipt ─────────────────────────────────────────────────────────────

export async function createGoodsReceipt(data: {
  purchaseOrder: string;
  warehouse: string;
  items: { item: string; receivedQty: number; unitPrice: number; uom: string; batchNumber?: string; expiryDate?: string }[];
  notes?: string;
  receivedDate?: string;
}, createdBy: string) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const po = await PurchaseOrder.findById(data.purchaseOrder).session(session);
    if (!po || !po.isActive) throw new AppError('Purchase order not found', 404);
    if (!['CONFIRMED', 'RECEIVED'].includes(po.status)) {
      throw new AppError('Purchase order must be CONFIRMED before receiving goods', 400);
    }

    const warehouse = await Warehouse.findById(data.warehouse).session(session);
    if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

    const grNumber = await generateGRNumber();
    const totalAmount = data.items.reduce((sum, i) => sum + i.receivedQty * i.unitPrice, 0);

    const grItems = data.items.map((i) => {
      const poItem = po.items.find((p) => String(p.item) === i.item);
      return {
        item: i.item,
        orderedQty: poItem?.orderedQty ?? 0,
        receivedQty: i.receivedQty,
        unitPrice: i.unitPrice,
        totalPrice: Math.round(i.receivedQty * i.unitPrice * 100) / 100,
        uom: i.uom,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate,
      };
    });

    const [gr] = await GoodsReceipt.create(
      [{
        grNumber,
        purchaseOrder: data.purchaseOrder,
        supplier: po.supplier,
        warehouse: data.warehouse,
        items: grItems,
        totalAmount: Math.round(totalAmount * 100) / 100,
        notes: data.notes,
        receivedDate: data.receivedDate ?? new Date(),
        createdBy,
      }],
      { session },
    );

    for (const grItem of data.items) {
      await postMovement({
        type: 'PURCHASE_RECEIPT',
        item: grItem.item,
        warehouse: data.warehouse,
        quantity: grItem.receivedQty,
        reference: grNumber,
        referenceModel: 'GoodsReceipt',
        referenceId: gr._id as unknown as string,
        notes: `GR from PO ${po.poNumber}`,
        createdBy,
        session,
      });

      const itemDoc = await Item.findById(grItem.item).select('baseUom costPrice').session(session);
      if (itemDoc) {
        let costPricePerBaseUnit = grItem.unitPrice;
        if (String(grItem.uom) !== String(itemDoc.baseUom)) {
          try {
            const factor = await convertQty(1, String(grItem.uom), String(itemDoc.baseUom));
            costPricePerBaseUnit = grItem.unitPrice / factor;
          } catch {
            costPricePerBaseUnit = grItem.unitPrice;
          }
        }
        await Item.findByIdAndUpdate(
          grItem.item,
          {
            lastPurchasePrice: grItem.unitPrice,
            costPrice: Math.round(costPricePerBaseUnit * 1000000) / 1000000,
          },
          { session },
        );
      }

      if (grItem.batchNumber) {
        await Batch.findOneAndUpdate(
          { batchNumber: grItem.batchNumber.toUpperCase(), item: grItem.item, warehouse: data.warehouse },
          {
            $inc: { quantity: grItem.receivedQty },
            $setOnInsert: { expiryDate: grItem.expiryDate, createdBy },
          },
          { upsert: true, session },
        );
      }
    }

    for (const grItem of data.items) {
      await PurchaseOrder.updateOne(
        { _id: data.purchaseOrder, 'items.item': grItem.item },
        { $inc: { 'items.$.receivedQty': grItem.receivedQty } },
        { session },
      );
    }
    await PurchaseOrder.findByIdAndUpdate(data.purchaseOrder, { status: 'RECEIVED' }, { session });

    await Supplier.findByIdAndUpdate(
      po.supplier,
      { $inc: { balance: Math.round(totalAmount * 100) / 100 } },
      { session },
    );

    await session.commitTransaction();
    return gr;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function getGoodsReceipts(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.purchaseOrder) filter.purchaseOrder = query.purchaseOrder;
  if (query.supplier) filter.supplier = query.supplier;
  if (query.item) filter['items.item'] = query.item;

  const [items, total] = await Promise.all([
    GoodsReceipt.find(filter)
      .populate('supplier', 'name')
      .populate('purchaseOrder', 'poNumber')
      .populate('warehouse', 'name code')
      .populate('items.item', 'name sku')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GoodsReceipt.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getGoodsReceiptById(id: string) {
  const gr = await GoodsReceipt.findById(id)
    .populate('supplier', 'name')
    .populate('purchaseOrder', 'poNumber')
    .populate('warehouse', 'name code')
    .populate('items.item', 'name sku')
    .populate('items.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!gr || !gr.isActive) throw new AppError('Goods receipt not found', 404);
  return gr;
}

// ── Supplier Payment ──────────────────────────────────────────────────────────

export async function createSupplierPayment(data: {
  supplier: string;
  purchaseOrder?: string;
  amount: number;
  paymentDate?: string;
  method: string;
  reference?: string;
  notes?: string;
}, createdBy: string) {
  const supplier = await Supplier.findById(data.supplier);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  if (data.amount > supplier.balance) {
    throw new AppError(`Payment amount (${data.amount}) exceeds outstanding balance (${supplier.balance})`, 400);
  }

  const paymentNumber = await generatePaymentNumber();

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [payment] = await SupplierPayment.create(
      [{
        paymentNumber,
        supplier: data.supplier,
        purchaseOrder: data.purchaseOrder,
        amount: data.amount,
        paymentDate: data.paymentDate ?? new Date(),
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        createdBy,
      }],
      { session },
    );

    await Supplier.findByIdAndUpdate(
      data.supplier,
      { $inc: { balance: -data.amount } },
      { session },
    );

    await session.commitTransaction();
    return payment;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function getSupplierPayments(supplierId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const [payments, total] = await Promise.all([
    SupplierPayment.find({ supplier: supplierId, isActive: true })
      .populate('purchaseOrder', 'poNumber')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit),
    SupplierPayment.countDocuments({ supplier: supplierId, isActive: true }),
  ]);

  return { payments, pagination: buildPagination(page, limit, total) };
}

// ── Supplier Dues ─────────────────────────────────────────────────────────────

export async function getSupplierDues(supplierId: string) {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  const [receipts, payments] = await Promise.all([
    GoodsReceipt.find({ supplier: supplierId, isActive: true })
      .populate('purchaseOrder', 'poNumber')
      .populate('items.item', 'name sku')
      .sort({ createdAt: -1 })
      .select('grNumber totalAmount receivedDate purchaseOrder items'),
    SupplierPayment.find({ supplier: supplierId, isActive: true })
      .sort({ paymentDate: -1 })
      .select('paymentNumber amount paymentDate method reference'),
  ]);

  const totalOrdered = receipts.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    supplier: { _id: supplier._id, name: supplier.name },
    outstandingBalance: supplier.balance,
    totalOrdered,
    totalPaid,
    receipts,
    recentPayments: payments,
  };
}
