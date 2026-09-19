import { Router } from 'express';
import {
  getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
  getSalaryStructures, createSalaryStructure, updateSalaryStructure,
  getAttendance, upsertAttendance, bulkUpsertAttendance, updateAttendance,
  getLeaves, getLeave, createLeave, updateLeaveStatus,
  getPayrolls, getPayroll, generatePayroll, bulkGeneratePayroll, updatePayrollStatus,
  downloadPayslipPDF,
} from './hr.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

// ── Employees ─────────────────────────────────────────────────────────────────
router.get('/employees', requirePermission(PERMISSIONS.HR_VIEW), getEmployees);
router.get('/employees/:id', requirePermission(PERMISSIONS.HR_VIEW), getEmployee);
router.post('/employees', requirePermission(PERMISSIONS.HR_CREATE), createEmployee);
router.patch('/employees/:id', requirePermission(PERMISSIONS.HR_UPDATE), updateEmployee);
router.delete('/employees/:id', requirePermission(PERMISSIONS.HR_CREATE), deleteEmployee);

// ── Salary Structures ─────────────────────────────────────────────────────────
router.get('/employees/:employeeId/salary-structures', requirePermission(PERMISSIONS.HR_VIEW), getSalaryStructures);
router.post('/salary-structures', requirePermission(PERMISSIONS.HR_CREATE), createSalaryStructure);
router.patch('/salary-structures/:id', requirePermission(PERMISSIONS.HR_UPDATE), updateSalaryStructure);

// ── Attendance ────────────────────────────────────────────────────────────────
router.get('/attendance', requirePermission(PERMISSIONS.HR_VIEW), getAttendance);
router.post('/attendance', requirePermission(PERMISSIONS.HR_CREATE), upsertAttendance);
router.post('/attendance/bulk', requirePermission(PERMISSIONS.HR_CREATE), bulkUpsertAttendance);
router.patch('/attendance/:id', requirePermission(PERMISSIONS.HR_UPDATE), updateAttendance);

// ── Leave ─────────────────────────────────────────────────────────────────────
router.get('/leaves', requirePermission(PERMISSIONS.HR_VIEW), getLeaves);
router.get('/leaves/:id', requirePermission(PERMISSIONS.HR_VIEW), getLeave);
router.post('/leaves', requirePermission(PERMISSIONS.HR_CREATE), createLeave);
router.patch('/leaves/:id/status', requirePermission(PERMISSIONS.HR_UPDATE), updateLeaveStatus);

// ── Payroll ───────────────────────────────────────────────────────────────────
router.get('/payroll', requirePermission(PERMISSIONS.PAYROLL_VIEW), getPayrolls);
router.get('/payroll/:id', requirePermission(PERMISSIONS.PAYROLL_VIEW), getPayroll);
router.get('/payroll/:id/pdf', requirePermission(PERMISSIONS.PAYROLL_VIEW), downloadPayslipPDF);
router.post('/payroll/generate', requirePermission(PERMISSIONS.PAYROLL_PROCESS), generatePayroll);
router.post('/payroll/bulk-generate', requirePermission(PERMISSIONS.PAYROLL_PROCESS), bulkGeneratePayroll);
router.patch('/payroll/:id/status', requirePermission(PERMISSIONS.PAYROLL_PROCESS), updatePayrollStatus);

export default router;
