import { Router } from 'express';
import {
  getSalesOrders, getSalesOrder, createSalesOrder, updateSalesOrder,
  cancelSalesOrder, deleteSalesOrder,
  getInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice, downloadInvoicePDF,
  createCustomerPayment, getCustomerPayment, updateCustomerPayment, downloadReceiptPDF, deletePayment,
  getAllPayments, getCustomerPayments, getCustomerDues,
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
router.patch('/orders/:id/cancel', requirePermission(PERMISSIONS.SALES_UPDATE), cancelSalesOrder);
router.delete('/orders/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deleteSalesOrder);

// Invoices
router.get('/invoices', requirePermission(PERMISSIONS.SALES_VIEW), getInvoices);
router.get('/invoices/:id', requirePermission(PERMISSIONS.SALES_VIEW), getInvoice);
router.get('/invoices/:id/pdf', requirePermission(PERMISSIONS.SALES_VIEW), downloadInvoicePDF);
router.post('/invoices', requirePermission(PERMISSIONS.SALES_CREATE), createInvoice);
router.patch('/invoices/:id', requirePermission(PERMISSIONS.SALES_UPDATE), updateInvoice);
router.delete('/invoices/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deleteInvoice);

// Customer payments & dues
router.get('/payments', requirePermission(PERMISSIONS.SALES_VIEW), getAllPayments);
router.post('/payments', requirePermission(PERMISSIONS.SALES_CREATE), createCustomerPayment);
router.get('/payments/:id', requirePermission(PERMISSIONS.SALES_VIEW), getCustomerPayment);
router.patch('/payments/:id', requirePermission(PERMISSIONS.SALES_UPDATE), updateCustomerPayment);
router.get('/payments/:id/pdf', requirePermission(PERMISSIONS.SALES_VIEW), downloadReceiptPDF);
router.delete('/payments/:id', requirePermission(PERMISSIONS.SALES_UPDATE), deletePayment);
router.get('/customers/:customerId/payments', requirePermission(PERMISSIONS.SALES_VIEW), getCustomerPayments);
router.get('/customers/:customerId/dues', requirePermission(PERMISSIONS.SALES_VIEW), getCustomerDues);

export default router;
