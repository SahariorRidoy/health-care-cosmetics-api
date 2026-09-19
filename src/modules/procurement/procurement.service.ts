import mongoose from 'mongoose';
import { GoodsReceipt } from './goodsReceipt.model';
import { SupplierPayment } from './supplierPayment.model';
import { PurchaseOrder } from './purchaseOrder.model';
import { Supplier } from './supplier.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { Batch } from '../inventory/batch.model';
import { postMovement } from '../inventory/stock.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── GR Number generator ───────────────────────────────────────────────────────

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

    // Build GR items with orderedQty from PO
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

    // Post stock movements for each item
    for (const item of data.items) {
      await postMovement({
        type: 'PURCHASE_RECEIPT',
        item: item.item,
        warehouse: data.warehouse,
        quantity: item.receivedQty,
        reference: grNumber,
        referenceModel: 'GoodsReceipt',
        referenceId: gr._id as unknown as string,
        notes: `GR from PO ${po.poNumber}`,
        createdBy,
        session,
      });

      // Create/update batch if batchNumber provided
      if (item.batchNumber) {
        await Batch.findOneAndUpdate(
          { batchNumber: item.batchNumber.toUpperCase(), item: item.item, warehouse: data.warehouse },
          {
            $inc: { quantity: item.receivedQty },
            $setOnInsert: { expiryDate: item.expiryDate, createdBy },
          },
          { upsert: true, session },
        );
      }
    }

    // Update PO receivedQty per line and status
    for (const item of data.items) {
      await PurchaseOrder.updateOne(
        { _id: data.purchaseOrder, 'items.item': item.item },
        { $inc: { 'items.$.receivedQty': item.receivedQty } },
        { session },
      );
    }
    await PurchaseOrder.findByIdAndUpdate(data.purchaseOrder, { status: 'RECEIVED' }, { session });

    // Increase supplier balance (we now owe them)
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

  const [items, total] = await Promise.all([
    GoodsReceipt.find(filter)
      .populate('supplier', 'name code')
      .populate('purchaseOrder', 'poNumber')
      .populate('warehouse', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GoodsReceipt.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getGoodsReceiptById(id: string) {
  const gr = await GoodsReceipt.findById(id)
    .populate('supplier', 'name code')
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

// ── Supplier Dues (T37) ───────────────────────────────────────────────────────

export async function getSupplierDues(supplierId: string) {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  const [receipts, payments] = await Promise.all([
    GoodsReceipt.find({ supplier: supplierId, isActive: true })
      .populate('purchaseOrder', 'poNumber')
      .sort({ createdAt: -1 })
      .select('grNumber totalAmount receivedDate purchaseOrder'),
    SupplierPayment.find({ supplier: supplierId, isActive: true })
      .sort({ paymentDate: -1 })
      .select('paymentNumber amount paymentDate method reference'),
  ]);

  return {
    supplier: { _id: supplier._id, name: supplier.name, code: supplier.code },
    outstandingBalance: supplier.balance,
    receipts,
    payments,
  };
}
