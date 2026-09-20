import type { Response } from 'express';
import { Invoice } from './invoice.model';
import { AppError } from '../../common/utils/errors';
import {
  createPDFResponse, drawHeader, drawSectionTitle, drawKeyValueGrid,
  drawDivider, drawLineItemsTable, drawTotalsBlock, drawFooter,
  formatBDT, formatDate,
} from '../../common/utils/pdfGenerator';

export async function generateInvoicePDF(invoiceId: string, res: Response) {
  const invoice = await Invoice.findById(invoiceId)
    .populate('customer', 'name phone email address')
    .populate('salesOrder', 'orderNumber')
    .populate('items.item', 'name sku')
    .populate('items.uom', 'symbol')
    .populate('createdBy', 'name');

  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);

  const customer = invoice.customer as unknown as Record<string, string>;
  const salesOrder = invoice.salesOrder as unknown as Record<string, string> | null;

  const doc = createPDFResponse(res, `Invoice-${invoice.invoiceNumber}.pdf`);

  drawHeader(doc, 'INVOICE', invoice.invoiceNumber);

  // ── Bill To / Invoice Info ────────────────────────────────────────────────
  drawSectionTitle(doc, 'Invoice Details');
  drawKeyValueGrid(doc, [
    { label: 'Customer', value: customer?.name ?? '—' },
    { label: 'Invoice Number', value: invoice.invoiceNumber },
    { label: 'Invoice Date', value: formatDate(invoice.createdAt) },
    { label: 'Contact', value: customer?.phone ?? customer?.email ?? '—' },
    { label: 'Due Date', value: formatDate(invoice.dueDate) },
    { label: 'Sales Order', value: salesOrder?.orderNumber ?? '—' },
    { label: 'Status', value: invoice.status },
  ]);

  if (customer?.address) {
    doc.fillColor('#64748B').fontSize(8).font('Helvetica')
      .text(`Address: ${customer.address}`, 50, doc.y);
    doc.moveDown(0.8);
  }

  drawDivider(doc);

  // ── Line Items ────────────────────────────────────────────────────────────
  drawSectionTitle(doc, 'Items');

  const colWidths = [200, 60, 70, 60, 50, 55];
  const headers = ['Item', 'UOM', 'Unit Price', 'Qty', 'Disc %', 'Line Total'];

  const rows = invoice.items.map((item) => {
    const itemDoc = item.item as unknown as Record<string, string>;
    const uomDoc = item.uom as unknown as Record<string, string>;
    return [
      itemDoc?.name ?? '—',
      uomDoc?.symbol ?? '—',
      formatBDT(item.unitPrice),
      String(item.qty),
      `${item.discount}%`,
      formatBDT(item.lineTotal),
    ];
  });

  drawLineItemsTable(doc, headers, colWidths, rows);
  drawDivider(doc);

  // ── Totals ────────────────────────────────────────────────────────────────
  drawTotalsBlock(doc, [
    { label: 'Subtotal', value: formatBDT(invoice.subtotal) },
    { label: 'Discount', value: `- ${formatBDT(invoice.discountAmount)}` },
    { label: `Tax (${invoice.taxPercent}%)`, value: formatBDT(invoice.taxAmount) },
    { label: 'Total Amount', value: formatBDT(invoice.totalAmount), bold: true },
    { label: 'Paid Amount', value: formatBDT(invoice.paidAmount) },
    { label: 'Amount Due', value: formatBDT(invoice.dueAmount), highlight: true },
  ]);

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    drawDivider(doc);
    drawSectionTitle(doc, 'Notes');
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica').text(invoice.notes, 50, doc.y, { width: 495 });
    doc.moveDown(1);
  }

  drawFooter(doc);
  doc.end();
}
