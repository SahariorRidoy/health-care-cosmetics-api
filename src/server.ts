import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { connectDatabase } from './database/connection';
import { errorHandler } from './common/middleware/errorHandler';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/users.routes';
import uomRoutes from './modules/inventory/uom.routes';
import warehouseRoutes from './modules/warehouse/warehouse.routes';
import itemRoutes from './modules/inventory/item.routes';
import stockRoutes from './modules/inventory/stock.routes';
import supplierRoutes from './modules/procurement/supplier.routes';
import purchaseOrderRoutes from './modules/procurement/purchaseOrder.routes';
import procurementRoutes from './modules/procurement/procurement.routes';
import productionRoutes from './modules/production/production.routes';
import customerRoutes from './modules/sales/customer.routes';
import salesRoutes from './modules/sales/sales.routes';
import financeRoutes from './modules/finance/finance.routes';
import departmentRoutes from './modules/hr/department.routes';
import hrRoutes from './modules/hr/hr.routes';
import reportsRoutes from './modules/reports/reports.routes';

const app = express();

// ── Security ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

// ── General rate limit ────────────────────────────────────
app.use(rateLimit({
  windowMs: config.rateLimit.generalWindowMs,
  max: config.rateLimit.generalMax,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

// ── Logging ───────────────────────────────────────────────
if (config.env !== 'test') {
  app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));
}

// ── Static uploads ────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ── DB connect middleware (serverless-safe) ──────────────
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (err) {
    next(err);
  }
});

// ── Root ─────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'HCC ERP API',
    description: 'Health Care Cosmetics - Enterprise Resource Planning API',
    version: '1.0.0',
    status: 'running',
    env: config.env,
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    health: '/health',
    baseUrl: `/api/v1`,
    modules: [
      'auth', 'users', 'inventory', 'warehouse',
      'procurement', 'production', 'sales',
      'finance', 'hr', 'reports',
    ],
  });
});

// ── Health check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'HCC ERP API',
    version: '1.0.0',
    env: config.env,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/uom', uomRoutes);
app.use('/api/v1/warehouses', warehouseRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/stock', stockRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
app.use('/api/v1/procurement', procurementRoutes);
app.use('/api/v1/production', productionRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/hr/departments', departmentRoutes);
app.use('/api/v1/hr', hrRoutes);
app.use('/api/v1/reports', reportsRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
if (config.env !== 'production') {
  connectDatabase()
    .then(() => {
      app.listen(config.port, () => {
        console.info(`✓ API running on http://localhost:${config.port} [${config.env}]`);
      });
    })
    .catch((err) => {
      console.error('Failed to connect to database:', err);
      process.exit(1);
    });

  process.on('SIGTERM', () => { process.exit(0); });
  process.on('SIGINT', () => { process.exit(0); });
}

export default app;
