import PDFDocument from 'pdfkit';
import type { Response } from 'express';

// ── Constants ─────────────────────────────────────────────────────────────────

const NAVY = '#0F172A';
const EMERALD = '#10B981';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBDT(amount: number): string {
  return `BDT ${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── PDF Builder ───────────────────────────────────────────────────────────────

export function createPDFResponse(res: Response, filename: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

export function drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  // Company block
  doc.rect(PAGE_MARGIN, PAGE_MARGIN, CONTENT_WIDTH, 60).fill(NAVY);
  doc
    .fillColor('#FFFFFF')
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Health Care Cosmetics Ltd.', PAGE_MARGIN + 16, PAGE_MARGIN + 12);
  doc
    .fillColor('#94A3B8')
    .fontSize(9)
    .font('Helvetica')
    .text('Cosmetics Manufacturer · Bangladesh · Currency: BDT (৳)', PAGE_MARGIN + 16, PAGE_MARGIN + 34);

  // Document title badge
  doc.rect(PAGE_WIDTH - PAGE_MARGIN - 120, PAGE_MARGIN + 10, 110, 40).fill(EMERALD);
  doc
    .fillColor('#FFFFFF')
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(title, PAGE_WIDTH - PAGE_MARGIN - 120, PAGE_MARGIN + 16, { width: 110, align: 'center' });
  doc
    .fillColor('#FFFFFF')
    .fontSize(8)
    .font('Helvetica')
    .text(subtitle, PAGE_WIDTH - PAGE_MARGIN - 120, PAGE_MARGIN + 32, { width: 110, align: 'center' });

  doc.moveDown(3.5);
}

export function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  const y = doc.y;
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 18).fill('#F8FAFC');
  doc
    .fillColor(NAVY)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text(title.toUpperCase(), PAGE_MARGIN + 8, y + 5);
  doc.moveDown(1.2);
}

export function drawKeyValueGrid(
  doc: PDFKit.PDFDocument,
  pairs: { label: string; value: string }[],
  columns = 2,
) {
  const colWidth = CONTENT_WIDTH / columns;
  const startY = doc.y;
  let col = 0;
  let rowY = startY;

  for (const { label, value } of pairs) {
    const x = PAGE_MARGIN + col * colWidth;
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(label, x, rowY);
    doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text(value, x, rowY + 11);
    col++;
    if (col >= columns) {
      col = 0;
      rowY += 32;
    }
  }

  // Advance cursor past the grid
  const rows = Math.ceil(pairs.length / columns);
  doc.y = rowY + (col > 0 ? 32 : 0);
  if (pairs.length % columns === 0) doc.y = startY + rows * 32;
  doc.moveDown(0.5);
}

export function drawDivider(doc: PDFKit.PDFDocument) {
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .strokeColor(BORDER)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.5);
}

export function drawLineItemsTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  widths: number[],
  rows: string[][],
) {
  const startX = PAGE_MARGIN;
  let y = doc.y;

  // Header row
  doc.rect(startX, y, CONTENT_WIDTH, 18).fill('#F1F5F9');
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc
      .fillColor(MUTED)
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text(headers[i], x + 4, y + 5, { width: widths[i] - 8, align: i > 0 ? 'right' : 'left' });
    x += widths[i];
  }
  y += 18;

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const rowHeight = 20;
    if (r % 2 === 1) {
      doc.rect(startX, y, CONTENT_WIDTH, rowHeight).fill('#FAFAFA');
    }
    x = startX;
    for (let i = 0; i < rows[r].length; i++) {
      doc
        .fillColor(NAVY)
        .fontSize(8)
        .font('Helvetica')
        .text(rows[r][i], x + 4, y + 6, { width: widths[i] - 8, align: i > 0 ? 'right' : 'left' });
      x += widths[i];
    }
    // Bottom border
    doc
      .moveTo(startX, y + rowHeight)
      .lineTo(startX + CONTENT_WIDTH, y + rowHeight)
      .strokeColor(BORDER)
      .lineWidth(0.3)
      .stroke();
    y += rowHeight;
  }

  doc.y = y + 8;
}

export function drawTotalsBlock(
  doc: PDFKit.PDFDocument,
  lines: { label: string; value: string; bold?: boolean; highlight?: boolean }[],
) {
  const blockWidth = 220;
  const x = PAGE_MARGIN + CONTENT_WIDTH - blockWidth;
  let y = doc.y;

  for (const line of lines) {
    if (line.highlight) {
      doc.rect(x - 8, y - 2, blockWidth + 8, 22).fill(NAVY);
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
        .text(line.label, x, y + 4, { width: blockWidth - 80 })
        .text(line.value, x + blockWidth - 80, y + 4, { width: 72, align: 'right' });
    } else {
      doc.fillColor(line.bold ? NAVY : MUTED)
        .fontSize(8.5)
        .font(line.bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(line.label, x, y + 3, { width: blockWidth - 80 })
        .text(line.value, x + blockWidth - 80, y + 3, { width: 72, align: 'right' });
    }
    y += line.highlight ? 26 : 18;
  }

  doc.y = y + 8;
}

export function drawFooter(doc: PDFKit.PDFDocument) {
  const pageCount = (doc.bufferedPageRange().count);
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .fillColor(MUTED)
      .fontSize(7.5)
      .font('Helvetica')
      .text(
        `Health Care Cosmetics Ltd. · Generated ${formatDate(new Date())} · Page ${i + 1} of ${pageCount}`,
        PAGE_MARGIN,
        doc.page.height - 30,
        { width: CONTENT_WIDTH, align: 'center' },
      );
  }
}

export { formatBDT, formatDate };
