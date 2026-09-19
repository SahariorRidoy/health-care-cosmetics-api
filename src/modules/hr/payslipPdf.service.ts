import type { Response } from 'express';
import { Payroll } from './payroll.model';
import { AppError } from '../../common/utils/errors';
import {
  createPDFResponse, drawHeader, drawSectionTitle, drawKeyValueGrid,
  drawDivider, drawLineItemsTable, drawTotalsBlock, drawFooter,
  formatBDT, formatDate,
} from '../../common/utils/pdfGenerator';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export async function generatePayslipPDF(payrollId: string, res: Response) {
  const payroll = await Payroll.findById(payrollId)
    .populate('employee', 'name employeeId designation department phone email joiningDate')
    .populate({ path: 'employee', populate: { path: 'department', select: 'name' } })
    .populate('createdBy', 'name');

  if (!payroll) throw new AppError('Payroll record not found', 404);

  const emp = payroll.employee as unknown as Record<string, unknown>;
  const dept = (emp?.department as Record<string, string>)?.name ?? '—';
  const periodLabel = `${MONTH_NAMES[payroll.period.month]} ${payroll.period.year}`;

  const doc = createPDFResponse(res, `Payslip-${payroll.payrollNumber}.pdf`);

  drawHeader(doc, 'PAYSLIP', payroll.payrollNumber);

  // ── Employee Info ─────────────────────────────────────────────────────────
  drawSectionTitle(doc, 'Employee Details');
  drawKeyValueGrid(doc, [
    { label: 'Employee Name', value: String(emp?.name ?? '—') },
    { label: 'Employee ID', value: String(emp?.employeeId ?? '—') },
    { label: 'Department', value: dept },
    { label: 'Designation', value: String(emp?.designation ?? '—') },
    { label: 'Pay Period', value: periodLabel },
    { label: 'Status', value: payroll.status },
    { label: 'Present Days', value: String(payroll.presentDays) },
    { label: 'Absent Days', value: String(payroll.absentDays) },
    { label: 'Paid Date', value: payroll.paidAt ? formatDate(payroll.paidAt) : '—' },
    { label: 'Payroll Date', value: formatDate(payroll.createdAt) },
  ]);

  drawDivider(doc);

  // ── Earnings ──────────────────────────────────────────────────────────────
  drawSectionTitle(doc, 'Earnings');
  const earningsRows: string[][] = [
    ['Basic Salary', formatBDT(payroll.baseSalary)],
    ...payroll.allowances.map((a) => [a.label, formatBDT(a.amount)]),
  ];
  drawLineItemsTable(doc, ['Description', 'Amount'], [380, 115], earningsRows);

  // ── Deductions ────────────────────────────────────────────────────────────
  if (payroll.deductions.length > 0) {
    drawSectionTitle(doc, 'Deductions');
    const deductionRows: string[][] = payroll.deductions.map((d) => [d.label, formatBDT(d.amount)]);
    drawLineItemsTable(doc, ['Description', 'Amount'], [380, 115], deductionRows);
  }

  drawDivider(doc);

  // ── Summary ───────────────────────────────────────────────────────────────
  drawTotalsBlock(doc, [
    { label: 'Gross Salary', value: formatBDT(payroll.grossSalary), bold: true },
    { label: 'Total Deductions', value: `- ${formatBDT(payroll.totalDeductions)}` },
    { label: 'Net Salary', value: formatBDT(payroll.netSalary), highlight: true },
  ]);

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (payroll.notes) {
    drawDivider(doc);
    drawSectionTitle(doc, 'Notes');
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica').text(payroll.notes, 50, doc.y, { width: 495 });
    doc.moveDown(1);
  }

  // ── Signature block ───────────────────────────────────────────────────────
  doc.moveDown(2);
  const sigY = doc.y;
  doc.moveTo(50, sigY).lineTo(180, sigY).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
  doc.moveTo(370, sigY).lineTo(500, sigY).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
  doc.fillColor('#64748B').fontSize(8).font('Helvetica')
    .text('Employee Signature', 50, sigY + 4, { width: 130, align: 'center' })
    .text('Authorized Signature', 370, sigY + 4, { width: 130, align: 'center' });

  drawFooter(doc);
  doc.end();
}
