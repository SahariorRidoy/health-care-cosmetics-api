/**
 * HCC ERP — End-to-End Workflow Test (T125)
 * Run: npx tsx tests/e2e-workflow.test.ts   (API must be on :5000)
 *
 * API envelope: { success, message, data: { <key>: [...] }, pagination? }
 * List keys per module:
 *   /uom          → data.uoms
 *   /warehouses   → data.warehouses
 *   /suppliers    → data.suppliers
 *   /customers    → data.customers
 *   /items        → data.items
 *   /stock/balances → data.items
 *   /stock/movements → data.movements
 *   /production/boms → data.items
 */

const BASE = 'http://localhost:5000/api/v1';
let token = '';
let passed = 0;
let failed = 0;
const failures: string[] = [];
const ids: Record<string, string> = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ApiEnvelope {
  success: boolean;
  message?: string;
  data?: unknown;
}

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({ success: false }))) as ApiEnvelope;
  return { ok: res.ok, status: res.status, json };
}

// Get the inner data object from the API envelope
function inner(r: { json: ApiEnvelope }): Record<string, unknown> {
  const d = r.json.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>;
  return {};
}

// Get a list from the inner data by key name
function list<T>(r: { json: ApiEnvelope }, key: string): T[] {
  const d = inner(r);
  return (d[key] as T[]) ?? [];
}

function assert(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    failures.push(label);
  }
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}\n▶ ${title}\n${'─'.repeat(60)}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testHealth() {
  section('Health Check');
  const res = await fetch('http://localhost:5000/health');
  const json = await res.json();
  assert('API is reachable', res.ok && json.status === 'ok');
}

async function testAuth() {
  section('Auth — Login');
  const r = await req('POST', '/auth/login', { email: 'admin@hcc.com', password: 'Admin@123456' });
  assert('Login succeeds (200)', r.ok, JSON.stringify(r.json));
  token = (inner(r).accessToken as string) ?? '';
  assert('Access token received', token.length > 0);
}

async function testUOMSetup() {
  section('UOM Setup');

  // Create UOMs — 409 means already exists, that's fine
  for (const uom of [
    { name: 'Gram', symbol: 'g' },
    { name: 'Kilogram', symbol: 'kg' },
    { name: 'Piece', symbol: 'pcs' },
    { name: 'Litre', symbol: 'L' },
    { name: 'Millilitre', symbol: 'ml' },
  ]) {
    const r = await req('POST', '/uom', uom);
    assert(`UOM "${uom.symbol}" created or exists`, r.ok || r.status === 409);
  }

  // List key is "uoms"
  const r = await req('GET', '/uom?limit=100');
  const uoms = list<{ _id: string; symbol: string }>(r, 'uoms');
  for (const u of uoms) ids[`uom_${u.symbol}`] = u._id;

  // DB may have 'lt' instead of 'L' — map both
  if (!ids['uom_L'] && ids['uom_lt']) ids['uom_L'] = ids['uom_lt'];

  assert('UOM IDs resolved (g, kg, pcs)',
    !!(ids['uom_g'] && ids['uom_kg'] && ids['uom_pcs']),
    `g=${ids['uom_g']} kg=${ids['uom_kg']} pcs=${ids['uom_pcs']}`);

  // Create conversions
  for (const c of [
    { fromUOM: ids['uom_kg'], toUOM: ids['uom_g'], factor: 1000 },
    { fromUOM: ids['uom_L'] ?? ids['uom_lt'], toUOM: ids['uom_ml'], factor: 1000 },
  ]) {
    if (!c.fromUOM || !c.toUOM) continue;
    const r = await req('POST', '/uom/conversions', c);
    assert(`Conversion ${c.factor}x created or exists`, r.ok || r.status === 409, JSON.stringify(r.json));
  }
}

async function testWarehouse() {
  section('Warehouse');
  const r = await req('GET', '/warehouses?limit=5');
  // List key is "warehouses"
  const warehouses = list<{ _id: string }>(r, 'warehouses');

  if (warehouses.length > 0) {
    ids['warehouse'] = warehouses[0]._id;
    assert('Warehouse exists', true);
  } else {
    const cr = await req('POST', '/warehouses', { name: 'Main Warehouse', code: 'WH-MAIN' });
    assert('Warehouse created', cr.ok, JSON.stringify(cr.json));
    ids['warehouse'] = (inner(cr)._id as string) ?? '';
  }
  assert('Warehouse ID set', !!ids['warehouse']);
}

async function testRawMaterials() {
  section('Raw Materials');

  for (const m of [
    { name: 'Aloe Vera Extract', sku: 'RM-ALOE-001', type: 'RAW_MATERIAL', category: 'Botanical', baseUom: ids['uom_g'], reorderLevel: 100, costPrice: 0 },
    { name: 'Shea Butter', sku: 'RM-SHEA-001', type: 'RAW_MATERIAL', category: 'Emollient', baseUom: ids['uom_g'], reorderLevel: 100, costPrice: 0 },
    { name: 'Plastic Bottle 200ml', sku: 'PKG-BTL-001', type: 'PACKAGING', category: 'Packaging', baseUom: ids['uom_pcs'], reorderLevel: 50, costPrice: 0 },
  ]) {
    const r = await req('POST', '/items', m);
    assert(`Item "${m.sku}" created or exists`, r.ok || r.status === 409, JSON.stringify(r.json));
  }

  // List key is "items"
  const r = await req('GET', '/items?limit=100');
  const items = list<{ _id: string; sku: string }>(r, 'items');
  for (const i of items) ids[`item_${i.sku}`] = i._id;

  assert('Raw material IDs resolved',
    !!(ids['item_RM-ALOE-001'] && ids['item_RM-SHEA-001']),
    `aloe=${ids['item_RM-ALOE-001']} shea=${ids['item_RM-SHEA-001']}`);
}

async function testFinishedProduct() {
  section('Finished Product');
  const r = await req('POST', '/items', {
    name: 'Aloe Moisturiser 200ml', sku: 'FG-MOIST-001', type: 'FINISHED_GOOD',
    category: 'Moisturiser', baseUom: ids['uom_pcs'], reorderLevel: 20,
    salePrice: 350, costPrice: 0,
  });
  assert('Finished product created or exists', r.ok || r.status === 409, JSON.stringify(r.json));

  const lr = await req('GET', '/items?limit=100');
  const items = list<{ _id: string; sku: string }>(lr, 'items');
  for (const i of items) ids[`item_${i.sku}`] = i._id;
  assert('Finished product ID resolved', !!ids['item_FG-MOIST-001']);
}

async function testEnforcement() {
  section('Enforcement Checks');

  if (ids['item_FG-MOIST-001']) {
    const sr = await req('POST', '/suppliers', {
      name: 'Enforcement Test Supplier', code: 'SUP-ENF-TST', category: 'Test',
    });
    const supId = (inner(sr)._id as string) ?? '';
    if (supId) {
      const poR = await req('POST', '/purchase-orders', {
        supplier: supId,
        items: [{ item: ids['item_FG-MOIST-001'], orderedQty: 10, unitPrice: 100, uom: ids['uom_pcs'] }],
      });
      assert('PO with finished good rejected (400)', poR.status === 400, JSON.stringify(poR.json));
    }
  }
}

async function testProcurement() {
  section('Procurement — Supplier → PO → GR');

  const sr = await req('POST', '/suppliers', {
    name: 'Botanical Supplies Ltd', code: 'SUP-BOT-001', category: 'Raw Material',
    contactPerson: 'Karim Ahmed', phone: '01711111111',
    email: 'karim@botanical.com', address: 'Chittagong, Bangladesh',
  });
  assert('Supplier created or exists', sr.ok || sr.status === 409, JSON.stringify(sr.json));

  // List key is "suppliers"
  const slr = await req('GET', '/suppliers?limit=50');
  const suppliers = list<{ _id: string; code: string }>(slr, 'suppliers');
  ids['supplier'] = suppliers.find((s) => s.code === 'SUP-BOT-001')?._id ?? '';
  assert('Supplier ID resolved', !!ids['supplier']);

  if (!ids['supplier'] || !ids['item_RM-ALOE-001']) return;

  const por = await req('POST', '/purchase-orders', {
    supplier: ids['supplier'],
    items: [
      { item: ids['item_RM-ALOE-001'], orderedQty: 5, unitPrice: 800, uom: ids['uom_kg'] },
      { item: ids['item_RM-SHEA-001'], orderedQty: 3, unitPrice: 1200, uom: ids['uom_kg'] },
    ],
    notes: 'Monthly raw material order',
    expectedDeliveryDate: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  assert('PO created', por.ok, JSON.stringify(por.json));
  ids['po'] = (inner(por)._id as string) ?? '';
  if (!ids['po']) return;

  const confR = await req('PATCH', `/purchase-orders/${ids['po']}/status`, { status: 'CONFIRMED' });
  assert('PO confirmed', confR.ok, JSON.stringify(confR.json));

  const grr = await req('POST', '/procurement/receipts', {
    purchaseOrder: ids['po'],
    warehouse: ids['warehouse'],
    items: [
      { item: ids['item_RM-ALOE-001'], receivedQty: 5, unitPrice: 800, uom: ids['uom_kg'] },
      { item: ids['item_RM-SHEA-001'], receivedQty: 3, unitPrice: 1200, uom: ids['uom_kg'] },
    ],
  });
  assert('Goods receipt created', grr.ok, JSON.stringify(grr.json));
  ids['gr'] = (inner(grr)._id as string) ?? '';

  // costPrice: 800 BDT/kg ÷ 1000 g/kg = 0.8 BDT/g
  const itemR = await req('GET', `/items/${ids['item_RM-ALOE-001']}`);
  const item = inner(itemR) as { costPrice?: number; lastPurchasePrice?: number };
  assert('Aloe costPrice ≈ 0.8/g after GR',
    Math.abs((item.costPrice ?? 0) - 0.8) < 0.001, `costPrice=${item.costPrice}`);
  assert('Aloe lastPurchasePrice = 800',
    item.lastPurchasePrice === 800, `lastPurchasePrice=${item.lastPurchasePrice}`);

  // stock: 5 kg → 5000 g
  const stockR = await req('GET', `/stock/balances?item=${ids['item_RM-ALOE-001']}`);
  const balances = list<{ quantity: number }>(stockR, 'items');
  const totalStock = balances.reduce((s, b) => s + b.quantity, 0);
  assert('Aloe stock = 5000g after GR', totalStock === 5000, `stock=${totalStock}`);
}

async function testBOM() {
  section('BOM Creation');
  if (!ids['item_FG-MOIST-001'] || !ids['item_RM-ALOE-001']) return;

  const r = await req('POST', '/production/boms', {
    product: ids['item_FG-MOIST-001'],
    version: 'v1.0',
    inputMaterials: [
      { item: ids['item_RM-ALOE-001'], qty: 150, uom: ids['uom_g'] },
      { item: ids['item_RM-SHEA-001'], qty: 50, uom: ids['uom_g'] },
      { item: ids['item_PKG-BTL-001'], qty: 1, uom: ids['uom_pcs'] },
    ],
    expectedOutputQty: 1,
    outputUom: ids['uom_pcs'],
    wastagePercent: 2,
  });
  assert('BOM created or exists', r.ok || r.status === 409, JSON.stringify(r.json));

  const lr = await req('GET', '/production/boms?limit=10');
  // BOM list key is "boms"
  const boms = list<{ _id: string; product: { _id: string } | string }>(lr, 'boms');
  const bom = boms.find((b) => {
    const pid = typeof b.product === 'object' ? b.product._id : b.product;
    return String(pid) === ids['item_FG-MOIST-001'];
  });
  ids['bom'] = bom?._id ?? '';
  assert('BOM ID resolved', !!ids['bom']);
}

async function testProduction() {
  section('Production — WO → Issue → Output → Cost Calc');
  if (!ids['bom'] || !ids['warehouse']) return;

  const wor = await req('POST', '/production/orders', {
    bom: ids['bom'], warehouse: ids['warehouse'], plannedQty: 10,
  });
  assert('Production order created', wor.ok, JSON.stringify(wor.json));
  ids['wo'] = (inner(wor)._id as string) ?? '';
  if (!ids['wo']) return;

  const startR = await req('PATCH', `/production/orders/${ids['wo']}/status`, { status: 'IN_PROGRESS' });
  assert('WO started (IN_PROGRESS)', startR.ok, JSON.stringify(startR.json));

  const issueR = await req('POST', `/production/orders/${ids['wo']}/issue`, {
    lines: [
      { item: ids['item_RM-ALOE-001'], qty: 1500 },
      { item: ids['item_RM-SHEA-001'], qty: 500 },
    ],
  });
  assert('Materials issued', issueR.ok, JSON.stringify(issueR.json));

  const outputR = await req('POST', `/production/orders/${ids['wo']}/output`, {
    actualOutputQty: 10,
    wastageQty: 0.2,
    actualConsumed: [
      { item: ids['item_RM-ALOE-001'], qty: 1500 },
      { item: ids['item_RM-SHEA-001'], qty: 500 },
    ],
  });
  assert('Production output recorded', outputR.ok, JSON.stringify(outputR.json));

  // aloe: 1500g × 0.8 = 1200, shea: 500g × 1.2 = 600, total = 1800, per unit = 180
  const woR = await req('GET', `/production/orders/${ids['wo']}`);
  const wo = inner(woR) as { totalMaterialCost?: number; costPerUnit?: number; status?: string };
  assert('WO status = COMPLETED', wo.status === 'COMPLETED', `status=${wo.status}`);
  assert('totalMaterialCost ≈ 1800',
    Math.abs((wo.totalMaterialCost ?? 0) - 1800) < 1, `totalMaterialCost=${wo.totalMaterialCost}`);
  assert('costPerUnit ≈ 180',
    Math.abs((wo.costPerUnit ?? 0) - 180) < 1, `costPerUnit=${wo.costPerUnit}`);

  const fgR = await req('GET', `/items/${ids['item_FG-MOIST-001']}`);
  const fg = inner(fgR) as { costPrice?: number; currentStock?: number };
  assert('FG costPrice updated to ≈180',
    Math.abs((fg.costPrice ?? 0) - 180) < 1, `costPrice=${fg.costPrice}`);
  assert('FG stock = 10 after production', fg.currentStock === 10, `stock=${fg.currentStock}`);

  const rmR = await req('GET', `/stock/balances?item=${ids['item_RM-ALOE-001']}`);
  const rmBal = list<{ quantity: number }>(rmR, 'items');
  const rmStock = rmBal.reduce((s, b) => s + b.quantity, 0);
  assert('Aloe stock = 3500g after production', rmStock === 3500, `stock=${rmStock}`);
}

async function testSales() {
  section('Sales — Customer → SO → Dispatch → Invoice → Payment');

  const cr = await req('POST', '/customers', {
    name: 'Dhaka Pharmacy Ltd', phone: '01822222222',
    email: 'rahim@dhakapharma.com', address: 'Dhaka', creditLimit: 100000,
  });
  assert('Customer created or exists', cr.ok || cr.status === 409, JSON.stringify(cr.json));

  // List key is "customers"
  const clr = await req('GET', '/customers?limit=50');
  const customers = list<{ _id: string; name: string }>(clr, 'customers');
  ids['customer'] = customers.find((c) => c.name === 'Dhaka Pharmacy Ltd')?._id ?? '';
  assert('Customer ID resolved', !!ids['customer']);

  if (!ids['customer'] || !ids['warehouse'] || !ids['item_FG-MOIST-001']) return;

  // Enforcement: raw material in SO must fail
  const badSO = await req('POST', '/sales/orders', {
    customer: ids['customer'], warehouse: ids['warehouse'],
    items: [{ item: ids['item_RM-ALOE-001'], qty: 1, unitPrice: 100, discount: 0, uom: ids['uom_g'] }],
    taxPercent: 0,
  });
  assert('SO with raw material rejected (400)', badSO.status === 400, JSON.stringify(badSO.json));

  const sor = await req('POST', '/sales/orders', {
    customer: ids['customer'], warehouse: ids['warehouse'],
    items: [{ item: ids['item_FG-MOIST-001'], qty: 5, unitPrice: 350, discount: 0, uom: ids['uom_pcs'] }],
    taxPercent: 5,
    deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString(),
  });
  assert('Sales order created', sor.ok, JSON.stringify(sor.json));
  ids['so'] = (inner(sor)._id as string) ?? '';
  if (!ids['so']) return;

  const confR = await req('PATCH', `/sales/orders/${ids['so']}/status`, { status: 'CONFIRMED' });
  assert('SO confirmed', confR.ok, JSON.stringify(confR.json));

  const dispR = await req('PATCH', `/sales/orders/${ids['so']}/status`, { status: 'DISPATCHED' });
  assert('SO dispatched', dispR.ok, JSON.stringify(dispR.json));

  const fgR = await req('GET', `/items/${ids['item_FG-MOIST-001']}`);
  const fg = inner(fgR) as { currentStock?: number };
  assert('FG stock = 5 after dispatch', fg.currentStock === 5, `stock=${fg.currentStock}`);

  const rmR = await req('GET', `/stock/balances?item=${ids['item_RM-ALOE-001']}`);
  const rmBal = list<{ quantity: number }>(rmR, 'items');
  const rmStock = rmBal.reduce((s, b) => s + b.quantity, 0);
  assert('RM stock unchanged by dispatch (3500)', rmStock === 3500, `stock=${rmStock}`);

  const invR = await req('POST', '/sales/invoices', {
    customer: ids['customer'], salesOrder: ids['so'],
    items: [{ item: ids['item_FG-MOIST-001'], qty: 5, unitPrice: 350, discount: 0, uom: ids['uom_pcs'] }],
    taxPercent: 5,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  assert('Invoice created', invR.ok, JSON.stringify(invR.json));
  ids['invoice'] = (inner(invR)._id as string) ?? '';
  if (!ids['invoice']) return;

  // Customer balance: 5 × 350 × 1.05 = 1837.5
  const custR = await req('GET', `/customers/${ids['customer']}`);
  const cust = inner(custR) as { balance?: number };
  assert('Customer balance = 1837.5',
    Math.abs((cust.balance ?? 0) - 1837.5) < 0.01, `balance=${cust.balance}`);

  const payR = await req('POST', '/sales/payments', {
    customer: ids['customer'], invoice: ids['invoice'],
    amount: 1837.5, method: 'BANK_TRANSFER', reference: 'TXN-001',
  });
  assert('Customer payment recorded', payR.ok, JSON.stringify(payR.json));

  const invCheckR = await req('GET', `/sales/invoices/${ids['invoice']}`);
  const inv = inner(invCheckR) as { status?: string; dueAmount?: number };
  assert('Invoice status = PAID', inv.status === 'PAID', `status=${inv.status}`);
  assert('Invoice dueAmount = 0', inv.dueAmount === 0, `dueAmount=${inv.dueAmount}`);
}

async function testStockIsolation() {
  section('Stock Isolation Verification');

  const fgMovR = await req('GET', `/stock/movements?item=${ids['item_FG-MOIST-001']}&type=PURCHASE_RECEIPT`);
  const fgMovs = list<unknown>(fgMovR, 'movements');
  assert('FG has no PURCHASE_RECEIPT movements', fgMovs.length === 0, `count=${fgMovs.length}`);

  const rmMovR = await req('GET', `/stock/movements?item=${ids['item_RM-ALOE-001']}&type=SALES_DISPATCH`);
  const rmMovs = list<unknown>(rmMovR, 'movements');
  assert('RM has no SALES_DISPATCH movements', rmMovs.length === 0, `count=${rmMovs.length}`);
}

async function testReports() {
  section('Reports');
  for (const ep of [
    '/reports/stock/balance',
    '/reports/sales',
    '/reports/purchase',
    '/reports/production',
    '/reports/finance',
    '/reports/hr/employees',
  ]) {
    const r = await req('GET', ep);
    assert(`${ep} responds 200`, r.ok, `status=${r.status}`);
  }
}

async function testSupplierPayment() {
  section('Supplier Payment');
  if (!ids['supplier']) return;

  const duesR = await req('GET', `/procurement/suppliers/${ids['supplier']}/dues`);
  assert('Supplier dues endpoint works', duesR.ok, JSON.stringify(duesR.json));
  const dues = inner(duesR) as { outstandingBalance?: number };

  if ((dues.outstandingBalance ?? 0) > 0) {
    const payR = await req('POST', '/procurement/payments', {
      supplier: ids['supplier'],
      amount: Math.min(dues.outstandingBalance!, 1000),
      method: 'BANK_TRANSFER',
      reference: 'PAY-TEST-001',
    });
    assert('Supplier payment recorded', payR.ok, JSON.stringify(payR.json));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  HCC ERP — End-to-End Workflow Test');
  console.log('═'.repeat(60));

  try {
    await testHealth();
    await testAuth();
    await testUOMSetup();
    await testWarehouse();
    await testRawMaterials();
    await testFinishedProduct();
    await testEnforcement();
    await testProcurement();
    await testBOM();
    await testProduction();
    await testSales();
    await testStockIsolation();
    await testReports();
    await testSupplierPayment();
  } catch (err) {
    console.error('\n💥 Unexpected error:', err);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log('═'.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main();
