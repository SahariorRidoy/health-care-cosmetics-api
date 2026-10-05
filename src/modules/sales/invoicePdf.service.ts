import path from 'path';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { Invoice } from './invoice.model';
import { AppError } from '../../common/utils/errors';
import { numberToBengaliWords } from '../../common/utils/bengaliWords';

// ── Bengali digit map ─────────────────────────────────────────────────────────

const BN_DIGITS: Record<string, string> = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};

function toBnDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[d] ?? d);
}

function formatBengaliDate(date: Date | string): string {
  const d = new Date(date);
  const dd  = toBnDigits(String(d.getDate()).padStart(2, '0'));
  const mm  = toBnDigits(String(d.getMonth() + 1).padStart(2, '0'));
  const yyyy = toBnDigits(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/** Returns empty string for 0 so blank table cells stay visually empty */
function fmtAmt(n: number): string {
  if (n <= 0) return '';
  return n.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Fill a rectangle with a color.
 * Completely isolated — sets fillColor, draws rect, fills, then resets to black.
 */
function fillRect(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  color: string,
): void {
  doc.fillColor(color).rect(x, y, w, h).fill();
  doc.fillColor('#000000'); // always reset to black after fill
}

/**
 * Stroke a rectangle border.
 * Completely isolated — sets strokeColor, draws rect, strokes, then resets.
 */
function strokeRect(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  lw = 0.6,
): void {
  doc.undash().strokeColor('#000000').lineWidth(lw).rect(x, y, w, h).stroke();
}

/** Draw a horizontal dotted line */
function dottedLine(
  doc: PDFKit.PDFDocument,
  x1: number, y: number, x2: number,
): void {
  doc
    .moveTo(x1, y).lineTo(x2, y)
    .dash(2, { space: 3 })
    .strokeColor('#999999').lineWidth(0.4)
    .stroke();
  // reset stroke state
  doc.undash().strokeColor('#000000').lineWidth(0.6);
}

/** Draw a solid horizontal line */
function solidLine(
  doc: PDFKit.PDFDocument,
  x1: number, y: number, x2: number,
  lw = 0.6,
): void {
  doc.undash().moveTo(x1, y).lineTo(x2, y).strokeColor('#000000').lineWidth(lw).stroke();
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateInvoicePDF(invoiceId: string, res: Response): Promise<void> {
  const invoice = await Invoice.findById(invoiceId)
    .populate('dealer', 'name phone address')
    .populate('items.item', 'name')
    .lean();

  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);

  const customer = invoice.dealer as unknown as {
    name: string; phone?: string; address?: string;
  };

  const FONT_REGULAR = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Regular.ttf');
  const FONT_BOLD    = path.join(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Bold.ttf');
  const LOGO_PATH    = path.join(process.cwd(), '..', 'logo.png');

  // Page: narrow tall — approx A5 width, tall enough for 20-row table
  const PAGE_W = 420;
  const PAGE_H = 645;
  const ML = 22;              // left margin
  const MR = 22;              // right margin
  const CW = PAGE_W - ML - MR; // content width = 376

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: 14, bottom: 14, left: ML, right: MR },
    bufferPages: false,
    autoFirstPage: true,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
  doc.pipe(res);

  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold',    FONT_BOLD);

  // Reset graphics state to known defaults
  doc.fillColor('#000000').strokeColor('#000000').lineWidth(0.6);

  let y = 14;

  // ══════════════════════════════════════════════════════════════════════════
  // 1. BISMILLAH
  // ══════════════════════════════════════════════════════════════════════════
  doc.font('Regular').fontSize(9).fillColor('#000000')
    .text('বিসমিল্লাহির রাহমানির রাহিম', ML, y, { width: CW, align: 'center' });
  y += 14;

  // ══════════════════════════════════════════════════════════════════════════
  // 2. LOGO  +  COMPANY NAME
  // ══════════════════════════════════════════════════════════════════════════
  const LOGO_W = 58;
  const LOGO_H = 52;
  try {
    doc.image(LOGO_PATH, ML, y, { width: LOGO_W, height: LOGO_H });
  } catch { /* logo missing — skip */ }

  doc.font('Bold').fontSize(26).fillColor('#000000')
    .text('হেলথ কেয়ার কসমেটিক্স', ML + LOGO_W + 6, y + 6, {
      width: CW - LOGO_W - 6,
      align: 'left',
      lineGap: 0,
    });
  y += LOGO_H + 2;

  // ══════════════════════════════════════════════════════════════════════════
  // 3. ADDRESS
  // ══════════════════════════════════════════════════════════════════════════
  doc.font('Bold').fontSize(10.5).fillColor('#000000')
    .text('পুরাতন ঈশ্বরদী, লালপুর, নাটোর।', ML, y, { width: CW, align: 'center' });
  y += 14;

  // ══════════════════════════════════════════════════════════════════════════
  // 4. DIVIDER LINE
  // ══════════════════════════════════════════════════════════════════════════
  solidLine(doc, ML, y, ML + CW, 0.8);
  y += 5;

  // ══════════════════════════════════════════════════════════════════════════
  // 5. INFO FIELDS
  // ══════════════════════════════════════════════════════════════════════════
  const FS   = 8.5;
  const HALF = CW / 2;

  // Row A — নং / তারিখ
  doc.font('Bold').fontSize(FS).fillColor('#000000').text('নং :', ML, y);
  doc.font('Regular').fontSize(FS).fillColor('#000000')
    .text(invoice.invoiceNumber, ML + 28, y, { width: HALF - 36, ellipsis: true });
  dottedLine(doc, ML + 26, y + 9, ML + HALF - 6);

  doc.font('Bold').fontSize(FS).fillColor('#000000').text('তারিখ :', ML + HALF, y);
  doc.font('Regular').fontSize(FS).fillColor('#000000')
    .text(formatBengaliDate(invoice.createdAt), ML + HALF + 46, y);
  dottedLine(doc, ML + HALF + 44, y + 9, ML + CW);
  y += 15;

  // Row B — প্রতিষ্ঠানের নাম / মোবা
  doc.font('Bold').fontSize(FS).fillColor('#000000').text('প্রতিষ্ঠানের নাম :', ML, y);
  doc.font('Regular').fontSize(FS).fillColor('#000000')
    .text(customer?.name ?? '', ML + 94, y, { width: HALF - 100, ellipsis: true });
  dottedLine(doc, ML + 92, y + 9, ML + HALF - 6);

  doc.font('Bold').fontSize(FS).fillColor('#000000').text('মোবা :', ML + HALF, y);
  doc.font('Regular').fontSize(FS).fillColor('#000000')
    .text(customer?.phone ?? '', ML + HALF + 44, y);
  dottedLine(doc, ML + HALF + 42, y + 9, ML + CW);
  y += 15;

  // Row C — ঠিকানা
  doc.font('Bold').fontSize(FS).fillColor('#000000').text('ঠিকানা :', ML, y);
  doc.font('Regular').fontSize(FS).fillColor('#000000')
    .text(customer?.address ?? '', ML + 54, y, { width: CW - 56, ellipsis: true });
  dottedLine(doc, ML + 52, y + 9, ML + CW);
  y += 13;

  // ══════════════════════════════════════════════════════════════════════════
  // 6. PRODUCT TABLE
  // ══════════════════════════════════════════════════════════════════════════
  // Col widths sum = 376 = CW: 28+140+46+52+52+58
  const COLS       = [28, 140, 46, 52, 52, 58];
  const HDR_H      = 24;
  const ROW_H      = 15;
  const TOTAL_ROWS = 20;

  const BN_SERIAL = [
    '১','২','৩','৪','৫','৬','৭','৮','৯','১০',
    '১১','১২','১৩','১৪','১৫','১৬','১৭','১৮','১৯','২০',
  ];
  const HDR_LABELS = ['ক্রমিক\nনং', 'পণ্যের বিবরণ', 'পরিমাণ', 'ফ্রি/গিফট', 'টিপি প্রাইস', 'টাকা'];

  // ── Header ────────────────────────────────────────────────────────────────
  fillRect(doc, ML, y, CW, HDR_H, '#cccccc');   // fill first
  strokeRect(doc, ML, y, CW, HDR_H);            // then border

  let cx = ML;
  for (let c = 0; c < COLS.length; c++) {
    strokeRect(doc, cx, y, COLS[c], HDR_H);
    const label = HDR_LABELS[c];
    doc.font('Bold').fontSize(7.5).fillColor('#000000')
      .text(label, cx + 2, y + (label.includes('\n') ? 5 : 8), {
        width: COLS[c] - 4,
        align: 'center',
        lineGap: label.includes('\n') ? -1 : 0,
      });
    cx += COLS[c];
  }
  y += HDR_H;

  // ── Data rows ─────────────────────────────────────────────────────────────
  const items = invoice.items as Array<{
    item: unknown; qty: number; giftQty?: number; unitPrice: number; lineTotal: number;
  }>;

  const TFS = 7.5;

  for (let row = 0; row < TOTAL_ROWS; row++) {
    const isLastRow = row === TOTAL_ROWS - 1;
    const bgColor   = row % 2 === 1 ? '#eeeeee' : '#ffffff';

    fillRect(doc, ML, y, CW, ROW_H, bgColor);
    strokeRect(doc, ML, y, CW, ROW_H);

    cx = ML;
    for (let c = 0; c < COLS.length; c++) {
      strokeRect(doc, cx, y, COLS[c], ROW_H);
      cx += COLS[c];
    }

    const item      = items[row];
    const itemName  = item?.item && typeof item.item === 'object'
      ? ((item.item as Record<string, unknown>).name as string) ?? '' : '';
    const qty       = item ? fmtAmt(item.qty)       : '';
    const giftQty   = item && item.giftQty && item.giftQty > 0 ? fmtAmt(item.giftQty) : '';
    const unitPrice = item ? fmtAmt(item.unitPrice)  : '';
    const lineTotal = item ? fmtAmt(item.lineTotal)  : '';
    const textY     = y + 4;

    // Col 0 — serial
    doc.font('Regular').fontSize(TFS).fillColor('#000000')
      .text(BN_SERIAL[row], ML + 1, textY, { width: COLS[0] - 2, align: 'center' });

    // Col 1 — product name
    if (itemName) {
      doc.font('Regular').fontSize(TFS).fillColor('#000000')
        .text(itemName, ML + COLS[0] + 3, textY, { width: COLS[1] - 5, ellipsis: true });
    }

    // Col 2 — paid quantity
    if (qty) {
      doc.font('Regular').fontSize(TFS).fillColor('#000000')
        .text(qty, ML + COLS[0] + COLS[1] + 2, textY, { width: COLS[2] - 4, align: 'center' });
    }

    // Col 3 — free/gift qty
    if (giftQty) {
      doc.font('Regular').fontSize(TFS).fillColor('#000000')
        .text(giftQty, ML + COLS[0] + COLS[1] + COLS[2] + 2, textY, { width: COLS[3] - 4, align: 'center' });
    }

    const col4X = ML + COLS[0] + COLS[1] + COLS[2] + COLS[3];
    const col5X = col4X + COLS[4];

    if (isLastRow) {
      doc.font('Bold').fontSize(7.5).fillColor('#000000')
        .text('মোট টাকা', col4X + 2, textY, { width: COLS[4] - 4, align: 'center' });
      doc.font('Bold').fontSize(TFS).fillColor('#000000')
        .text(fmtAmt(invoice.totalAmount), col5X + 2, textY, { width: COLS[5] - 4, align: 'right' });
    } else {
      // Col 4 — TP Price (unit price before commission)
      if (unitPrice) {
        doc.font('Regular').fontSize(TFS).fillColor('#000000')
          .text(unitPrice, col4X + 2, textY, { width: COLS[4] - 4, align: 'right' });
      }
      // Col 5 — টাকা (net line total after commission)
      if (lineTotal) {
        doc.font('Regular').fontSize(TFS).fillColor('#000000')
          .text(lineTotal, col5X + 2, textY, { width: COLS[5] - 4, align: 'right' });
      }
    }

    y += ROW_H;
  }

  y += 6;

  // ══════════════════════════════════════════════════════════════════════════
  // 7. টাকা (কথায়)
  // ══════════════════════════════════════════════════════════════════════════
  const words = numberToBengaliWords(invoice.totalAmount);
  doc.font('Bold').fontSize(8.5).fillColor('#000000').text('টাকা (কথায়) ঃ', ML, y);
  doc.font('Regular').fontSize(8.5).fillColor('#000000')
    .text(words, ML + 90, y, { width: CW - 90 });
  dottedLine(doc, ML + 88, y + 11, ML + CW);
  y += 20;

  // ══════════════════════════════════════════════════════════════════════════
  // 7b. PAID / DUE
  // ══════════════════════════════════════════════════════════════════════════
  const paidAmt = (invoice.paidAmount ?? 0);
  const dueAmt  = (invoice.dueAmount  ?? 0);

  const paidStr = paidAmt > 0 ? paidAmt.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '০.০০';
  const dueStr  = dueAmt  > 0 ? dueAmt.toLocaleString('en-BD',  { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '০.০০';

  doc.font('Bold').fontSize(8.5).fillColor('#000000')
    .text('পরিশোধিত টাকা ঃ', ML + CW - 160, y, { width: 100, align: 'right' });
  doc.font('Regular').fontSize(8.5).fillColor('#000000')
    .text(paidStr, ML + CW - 58, y, { width: 58, align: 'right' });
  dottedLine(doc, ML + CW - 60, y + 11, ML + CW);
  y += 14;

  doc.font('Bold').fontSize(8.5).fillColor('#000000')
    .text('বাকি টাকা ঃ', ML + CW - 160, y, { width: 100, align: 'right' });
  doc.font('Regular').fontSize(8.5).fillColor('#000000')
    .text(dueStr, ML + CW - 58, y, { width: 58, align: 'right' });
  dottedLine(doc, ML + CW - 60, y + 11, ML + CW);
  y += 36;

  // ══════════════════════════════════════════════════════════════════════════
  // 8. SIGNATURES
  // ══════════════════════════════════════════════════════════════════════════
  const SIG_W = 90;

  solidLine(doc, ML, y, ML + SIG_W);
  doc.font('Regular').fontSize(8).fillColor('#000000')
    .text('ক্রেতার স্বাক্ষর', ML, y + 4, { width: SIG_W, align: 'center' });

  solidLine(doc, ML + CW - SIG_W, y, ML + CW);
  doc.font('Regular').fontSize(8).fillColor('#000000')
    .text('বিক্রেতার স্বাক্ষর', ML + CW - SIG_W, y + 4, { width: SIG_W, align: 'center' });

  doc.end();
}
