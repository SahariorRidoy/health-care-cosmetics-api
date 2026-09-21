import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import { AuthRequest } from '../../common/middleware/protect';
import * as hrService from './hr.service';
import { generatePayslipPDF } from './payslipPdf.service';
import {
  createEmployeeSchema, updateEmployeeSchema,
  createSalaryStructureSchema, updateSalaryStructureSchema,
  createAttendanceSchema, bulkAttendanceSchema, updateAttendanceSchema,
  createLeaveSchema, updateLeaveStatusSchema,
  generatePayrollSchema, bulkGeneratePayrollSchema, updatePayrollStatusSchema,
} from './hr.validator';

// ── Employees ─────────────────────────────────────────────────────────────────

export const getEmployees = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hrService.getEmployees(req.query as Record<string, unknown>);
  sendResponse(res, 200, { employees: items }, 'Employees fetched', pagination);
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const emp = await hrService.getEmployeeById(req.params.id);
  sendResponse(res, 200, { employee: emp }, 'Employee fetched');
});

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = createEmployeeSchema.parse(req.body);
  const emp = await hrService.createEmployee(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { employee: emp }, 'Employee created');
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = updateEmployeeSchema.parse(req.body);
  const emp = await hrService.updateEmployee(req.params.id, data);
  sendResponse(res, 200, { employee: emp }, 'Employee updated');
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
  await hrService.deleteEmployee(req.params.id);
  sendResponse(res, 200, null, 'Employee deactivated');
});

export const uploadEmployeeDocuments = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const cvFile = files?.['cv']?.[0];
  const nidFile = files?.['nid']?.[0];
  const emp = await hrService.updateEmployeeDocuments(req.params.id, cvFile?.filename, nidFile?.filename);
  sendResponse(res, 200, { employee: emp }, 'Documents uploaded');
});

// ── Salary Structure ──────────────────────────────────────────────────────────

export const getSalaryStructures = asyncHandler(async (req: Request, res: Response) => {
  const structures = await hrService.getSalaryStructures(req.params.employeeId);
  sendResponse(res, 200, { structures }, 'Salary structures fetched');
});

export const createSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
  const data = createSalaryStructureSchema.parse(req.body);
  const structure = await hrService.createSalaryStructure(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { structure }, 'Salary structure created');
});

export const updateSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
  const data = updateSalaryStructureSchema.parse(req.body);
  const structure = await hrService.updateSalaryStructure(req.params.id, data);
  sendResponse(res, 200, { structure }, 'Salary structure updated');
});

// ── Attendance ────────────────────────────────────────────────────────────────

export const getAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hrService.getAttendance(req.query as Record<string, unknown>);
  sendResponse(res, 200, { attendance: items }, 'Attendance fetched', pagination);
});

export const upsertAttendance = asyncHandler(async (req: Request, res: Response) => {
  const data = createAttendanceSchema.parse(req.body);
  const record = await hrService.upsertAttendance(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { attendance: record }, 'Attendance saved');
});

export const bulkUpsertAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { date, records } = bulkAttendanceSchema.parse(req.body);
  const result = await hrService.bulkUpsertAttendance(date, records, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { result }, 'Bulk attendance saved');
});

export const updateAttendance = asyncHandler(async (req: Request, res: Response) => {
  const data = updateAttendanceSchema.parse(req.body);
  const record = await hrService.updateAttendance(req.params.id, data);
  sendResponse(res, 200, { attendance: record }, 'Attendance updated');
});

// ── Leave ─────────────────────────────────────────────────────────────────────

export const getLeaves = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hrService.getLeaves(req.query as Record<string, unknown>);
  sendResponse(res, 200, { leaves: items }, 'Leaves fetched', pagination);
});

export const getLeave = asyncHandler(async (req: Request, res: Response) => {
  const leave = await hrService.getLeaveById(req.params.id);
  sendResponse(res, 200, { leave }, 'Leave fetched');
});

export const createLeave = asyncHandler(async (req: Request, res: Response) => {
  const data = createLeaveSchema.parse(req.body);
  const leave = await hrService.createLeave(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { leave }, 'Leave request created');
});

export const updateLeaveStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, notes } = updateLeaveStatusSchema.parse(req.body);
  const leave = await hrService.updateLeaveStatus(req.params.id, status, notes);
  sendResponse(res, 200, { leave }, `Leave ${status.toLowerCase()}`);
});

// ── Payroll ───────────────────────────────────────────────────────────────────

export const getPayrolls = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await hrService.getPayrolls(req.query as Record<string, unknown>);
  sendResponse(res, 200, { payrolls: items }, 'Payrolls fetched', pagination);
});

export const getPayroll = asyncHandler(async (req: Request, res: Response) => {
  const payroll = await hrService.getPayrollById(req.params.id);
  sendResponse(res, 200, { payroll }, 'Payroll fetched');
});

export const generatePayroll = asyncHandler(async (req: Request, res: Response) => {
  const data = generatePayrollSchema.parse(req.body);
  const payroll = await hrService.generatePayroll(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { payroll }, 'Payroll generated');
});

export const bulkGeneratePayroll = asyncHandler(async (req: Request, res: Response) => {
  const data = bulkGeneratePayrollSchema.parse(req.body);
  const results = await hrService.bulkGeneratePayroll(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { results }, 'Bulk payroll generation complete');
});

export const updatePayrollStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updatePayrollStatusSchema.parse(req.body);
  const payroll = await hrService.updatePayrollStatus(req.params.id, status);
  sendResponse(res, 200, { payroll }, `Payroll ${status.toLowerCase()}`);
});

export const downloadPayslipPDF = asyncHandler(async (req: Request, res: Response) => {
  await generatePayslipPDF(req.params.id, res);
});
