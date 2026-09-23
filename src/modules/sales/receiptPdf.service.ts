import type { Response } from 'express';
import { CustomerPayment } from './customerPayment.model';
import { Invoice } from './invoice.model';
import { AppError } from '../../common/utils/errors';
import {
  createPDFResponse, drawHeader, drawSectionTitle, drawKeyValueGrid,
  drawDivider, drawTotalsBlock, drawFooter,
  formatBDT, formatDate,
} from '../../common/utils/pdfGenerator';

export async function generateReceiptPDF(paymentId: string, res: Response) {
  const payment = await CustomerPayment.findById(paymentId)
    .populate('customer', 'name phone email address')
    .populate('invoice', 'invoiceNumber totalAmount paidAmount dueAmount status');

  if (!payment || !payment.isActive) throw new AppError('Payment not found', 404);

  const customer = payment.customer as unknown as Record<string, string>;
  const invoice = payment.invoice as unknown as Record<string, string | number>;

  // Fetch all previous payments on the same invoice (excluding this one)
  const previousPayments = await CustomerPayment.find({
    invoice: invoice._id ?? payment.invoice,
    isActive: true,
    _id: { $ne: payment._id },
    paymentDate: { $lte: payment.paymentDate },
  }).sort({ paymentDate: 1 }).select('receiptNumber amount method paymentDate');

  const previouslyPaid = previousPayments.reduce((sum, p) => sum + p.amount, 0);
  const invoiceTotal = Number(invoice.totalAmount ?? 0);
  const balanceAfter = Math.max(0, invoiceTotal - previouslyPaid - payment.amount);

  const doc = createPDFResponse(res, `Receipt-${payment.receiptNumber}.pdf`);

  drawHeader(doc, 'RECEIPT', payment.receiptNumber);

  drawSectionTitle(doc, 'Receipt Details');
  drawKeyValueGrid(doc, [
    { label: 'Customer', value: customer?.name ?? '—' },
    { label: 'Receipt Number', value: payment.receiptNumber },
    { label: 'Payment Date', value: formatDate(payment.paymentDate) },
    { label: 'Contact', value: customer?.phone ?? customer?.email ?? '—' },
    { label: 'Invoice', value: String(invoice?.invoiceNumber ?? '—') },
    { label: 'Payment Method', value: payment.method.replace('_', ' ') },
    ...(payment.reference ? [{ label: 'Reference', value: payment.reference }] : []),
  ]);

  drawDivider(doc);

  // Payment history for this invoice
  if (previousPayments.length > 0) {
    drawSectionTitle(doc, 'Previous Payments on This Invoice');
    drawKeyValueGrid(doc,
      previousPayments.map((p) => ({
        label: `${p.receiptNumber} · ${formatDate(p.paymentDate)} · ${p.method.replace('_', ' ')}`,
        value: formatBDT(p.amount),
      })),
      1,
    );
    drawDivider(doc);
  }

  drawTotalsBlock(doc, [
    { label: 'Invoice Total', value: formatBDT(invoiceTotal) },
    ...(previouslyPaid > 0 ? [{ label: 'Previously Paid', value: formatBDT(previouslyPaid) }] : []),
    { label: 'Amount Received', value: formatBDT(payment.amount + (payment.changeAmount ?? 0)), bold: true },
    { label: 'Applied to Invoice', value: formatBDT(payment.amount) },
    ...((payment.changeAmount ?? 0) > 0 ? [{ label: 'Change Given', value: formatBDT(payment.changeAmount!), highlight: true }] : []),
    { label: balanceAfter > 0 ? 'Remaining Balance Due' : 'Invoice Status', value: balanceAfter > 0 ? formatBDT(balanceAfter) : 'PAID IN FULL', bold: true },
  ]);

  if (payment.notes) {
    drawDivider(doc);
    drawSectionTitle(doc, 'Notes');
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica').text(payment.notes, 50, doc.y, { width: 495 });
    doc.moveDown(1);
  }

  drawFooter(doc);
  doc.end();
}
