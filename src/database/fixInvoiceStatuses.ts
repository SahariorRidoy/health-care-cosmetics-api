/**
 * One-time fix: correct invoice statuses where paidAmount < totalAmount but status = 'PAID'
 * Run: npx ts-node src/database/fixInvoiceStatuses.ts
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;

async function fix() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db!;
  const invoices = db.collection('invoices');

  // Find all active invoices marked PAID but paidAmount < totalAmount
  const bad = await invoices.find({
    isActive: true,
    status: 'PAID',
    $expr: { $lt: ['$paidAmount', '$totalAmount'] },
  }).toArray();

  console.log(`Found ${bad.length} invoice(s) with incorrect PAID status`);

  let fixed = 0;
  for (const inv of bad) {
    const correctStatus = inv.paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
    const correctDue = Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100;
    await invoices.updateOne(
      { _id: inv._id },
      { $set: { status: correctStatus, dueAmount: correctDue } },
    );
    console.log(`  Fixed invoice ${inv.invoiceNumber}: PAID → ${correctStatus} (due: ${correctDue})`);
    fixed++;
  }

  console.log(`\nDone. Fixed ${fixed} invoice(s).`);
  await mongoose.disconnect();
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
