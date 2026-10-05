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
  if (query.search) {
    const regex = { $regex: String(query.search), $options: 'i' };
    filter.$or = [{ grNumber: regex }];
  }

  const [items, total] = await Promise.all([
    GoodsReceipt.find(filter)
      .populate('supplier', 'name')
      .populate('purchaseOrder', 'poNumber isActive paymentStatus paidAmount totalAmount')
      .populate('warehouse', 'name code')
      .populate('items.item', 'name sku')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GoodsReceipt.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function deleteGoodsReceipt(id: string) {
  const gr = await GoodsReceipt.findById(id);
  if (!gr || !gr.isActive) throw new AppError('Goods receipt not found', 404);

  const po = await PurchaseOrder.findById(gr.purchaseOrder);
  if (po && po.isActive) throw new AppError('Cannot delete a receipt that belongs to an active purchase order. Delete the purchase order instead.', 400);

  // Reverse the supplier balance for this receipt
  await Supplier.findByIdAndUpdate(gr.supplier, { $inc: { balance: -gr.totalAmount } });

  gr.isActive = false;
  return gr.save();
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

    // If linked to a PO, update its paidAmount too
    if (data.purchaseOrder) {
      const po = await PurchaseOrder.findById(data.purchaseOrder).session(session);
      if (po) {
        const newPaid = Math.min(po.totalAmount, (po.paidAmount ?? 0) + data.amount);
        const paymentStatus = newPaid >= po.totalAmount ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
        await PurchaseOrder.findByIdAndUpdate(
          data.purchaseOrder,
          { paidAmount: Math.round(newPaid * 100) / 100, paymentStatus },
          { session },
        );
      }
    }

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
      .populate('purchaseOrders.purchaseOrder', 'poNumber')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit),
    SupplierPayment.countDocuments({ supplier: supplierId, isActive: true }),
  ]);

  return { payments, pagination: buildPagination(page, limit, total) };
}

export async function getAllSupplierPayments(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.supplier) filter.supplier = query.supplier;
  if (query.method) filter.method = query.method;
  if (query.search) {
    filter.$or = [{ paymentNumber: { $regex: String(query.search), $options: 'i' } }];
  }

  const [payments, total] = await Promise.all([
    SupplierPayment.find(filter)
      .populate('supplier', 'name')
      .populate('purchaseOrder', 'poNumber')
      .populate('purchaseOrders.purchaseOrder', 'poNumber')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit),
    SupplierPayment.countDocuments(filter),
  ]);

  return { payments, pagination: buildPagination(page, limit, total) };
}

export async function getSupplierPaymentById(id: string) {
  const payment = await SupplierPayment.findById(id)
    .populate('supplier', 'name contactPerson phone email address')
    .populate('purchaseOrder', 'poNumber totalAmount paidAmount paymentStatus')
    .populate('purchaseOrders.purchaseOrder', 'poNumber totalAmount paidAmount paymentStatus createdAt')
    .populate('createdBy', 'name');
  if (!payment || !payment.isActive) throw new AppError('Payment not found', 404);
  return payment;
}

// ── Supplier Payment FIFO ────────────────────────────────────────────────────

export async function createSupplierPaymentFIFO(data: {
  supplier: string;
  amount: number;
  paymentDate?: string;
  method: string;
  reference?: string;
  notes?: string;
}, createdBy: string) {
  const supplier = await Supplier.findById(data.supplier);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  // Get all unpaid/partial POs sorted oldest first (FIFO)
  const unpaidPOs = await PurchaseOrder.find({
    supplier: data.supplier,
    isActive: true,
    paymentStatus: { $in: ['UNPAID', 'PARTIAL'] },
  }).sort({ createdAt: 1 });

  if (unpaidPOs.length === 0) throw new AppError('No outstanding purchase orders found for this supplier', 400);

  const paymentNumber = await generatePaymentNumber();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let remaining = data.amount;
    const breakdown: { purchaseOrder: string; appliedAmount: number }[] = [];

    for (const po of unpaidPOs) {
      if (remaining <= 0) break;
      const due = Math.max(0, po.totalAmount - (po.paidAmount ?? 0));
      if (due <= 0) continue;

      const applying = Math.min(remaining, due);
      const newPaid = Math.round(((po.paidAmount ?? 0) + applying) * 100) / 100;
      const paymentStatus = newPaid >= po.totalAmount ? 'PAID' : 'PARTIAL';

      await PurchaseOrder.findByIdAndUpdate(
        po._id,
        { paidAmount: newPaid, paymentStatus },
        { session },
      );
      breakdown.push({ purchaseOrder: String(po._id), appliedAmount: applying });
      remaining = Math.round((remaining - applying) * 100) / 100;
    }

    const [payment] = await SupplierPayment.create(
      [{
        paymentNumber,
        supplier: data.supplier,
        purchaseOrders: breakdown,
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

export async function deleteSupplierPayment(id: string) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const payment = await SupplierPayment.findById(id).session(session);
    if (!payment || !payment.isActive) throw new AppError('Payment not found', 404);

    // Reverse supplier balance
    await Supplier.findByIdAndUpdate(payment.supplier, { $inc: { balance: payment.amount } }, { session });

    // Reverse single PO paidAmount
    if (payment.purchaseOrder) {
      const po = await PurchaseOrder.findById(payment.purchaseOrder).session(session);
      if (po) {
        const newPaid = Math.max(0, Math.round(((po.paidAmount ?? 0) - payment.amount) * 100) / 100);
        const paymentStatus = newPaid <= 0 ? 'UNPAID' : newPaid >= po.totalAmount ? 'PAID' : 'PARTIAL';
        await PurchaseOrder.findByIdAndUpdate(payment.purchaseOrder, { paidAmount: newPaid, paymentStatus }, { session });
      }
    }

    // Reverse FIFO POs
    for (const line of payment.purchaseOrders ?? []) {
      const po = await PurchaseOrder.findById(line.purchaseOrder).session(session);
      if (po) {
        const newPaid = Math.max(0, Math.round(((po.paidAmount ?? 0) - line.appliedAmount) * 100) / 100);
        const paymentStatus = newPaid <= 0 ? 'UNPAID' : newPaid >= po.totalAmount ? 'PAID' : 'PARTIAL';
        await PurchaseOrder.findByIdAndUpdate(line.purchaseOrder, { paidAmount: newPaid, paymentStatus }, { session });
      }
    }

    payment.isActive = false;
    await payment.save({ session });

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// ── Supplier Dues ─────────────────────────────────────────────────────────────

export async function getSupplierDues(supplierId: string) {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  const [receipts, payments, pos] = await Promise.all([
    GoodsReceipt.find({ supplier: supplierId, isActive: true })
      .populate('purchaseOrder', 'poNumber')
      .populate('items.item', 'name sku')
      .sort({ createdAt: -1 })
      .select('grNumber totalAmount receivedDate purchaseOrder items'),
    SupplierPayment.find({ supplier: supplierId, isActive: true })
      .sort({ paymentDate: -1 })
      .select('paymentNumber amount paymentDate method reference'),
    PurchaseOrder.find({ supplier: supplierId, isActive: true }),
  ]);

  const totalOrdered = receipts.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstandingBalance = pos.reduce((sum, po) => sum + Math.max(0, po.totalAmount - (po.paidAmount ?? 0)), 0);

  // Keep supplier.balance in sync
  if (Math.round(supplier.balance * 100) !== Math.round(outstandingBalance * 100)) {
    await Supplier.findByIdAndUpdate(supplierId, { balance: Math.round(outstandingBalance * 100) / 100 });
  }

  return {
    supplier: { _id: supplier._id, name: supplier.name },
    outstandingBalance: Math.round(outstandingBalance * 100) / 100,
    totalOrdered,
    totalPaid,
    receipts,
    recentPayments: payments,
  };
}
