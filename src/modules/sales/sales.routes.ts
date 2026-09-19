import { Router } from 'express';
import {
  getSalesOrders, getSalesOrder, createSalesOrder, updateSalesOrder,
  updateSalesOrderStatus, deleteSalesOrder,
  getInvoices, getInvoice, createInvoice, downloadInvoicePDF,
  createCustomerPayment, getCustomerPayments, getCustomerDues,
} from './sales.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

// Sales Orders
router.get('/orders', requirePermission(PERMISSIONS.SALES_VIEW), getSalesOrders);
router.get('/orders/:id', requirePermission(PERMISSIONS.SALES_VIEW), getSalesOrder);
router.post('/orders', requirePermission(PERMISSIONS.SALES_CREATE), createSalesOrder);
router.patch('/orders/:id', requirePermission(PERMISSIONS.SALES_UPDATE), updateSalesOrder);
router.patch('/orders/:id/status', requirePermission(PERMISSIONS.SALES_UPDATE), updateSalesOrderStatus);
router.delete('/orders/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deleteSalesOrder);

// Invoices
router.get('/invoices', requirePermission(PERMISSIONS.SALES_VIEW), getInvoices);
router.get('/invoices/:id', requirePermission(PERMISSIONS.SALES_VIEW), getInvoice);
router.get('/invoices/:id/pdf', requirePermission(PERMISSIONS.SALES_VIEW), downloadInvoicePDF);
router.post('/invoices', requirePermission(PERMISSIONS.SALES_CREATE), createInvoice);

// Customer payments & dues
router.post('/payments', requirePermission(PERMISSIONS.SALES_CREATE), createCustomerPayment);
router.get('/customers/:customerId/payments', requirePermission(PERMISSIONS.SALES_VIEW), getCustomerPayments);
router.get('/customers/:customerId/dues', requirePermission(PERMISSIONS.SALES_VIEW), getCustomerDues);

export default router;
