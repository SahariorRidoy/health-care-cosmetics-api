// All permissions in the system
export const PERMISSIONS = {
  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_UPDATE: 'inventory.update',
  INVENTORY_DELETE: 'inventory.delete',
  STOCK_ADJUST: 'stock.adjust',

  // Procurement
  PROCUREMENT_VIEW: 'procurement.view',
  PROCUREMENT_CREATE: 'procurement.create',
  PROCUREMENT_UPDATE: 'procurement.update',

  // Production
  PRODUCTION_VIEW: 'production.view',
  PRODUCTION_CREATE: 'production.create',
  PRODUCTION_UPDATE: 'production.update',

  // Sales
  SALES_VIEW: 'sales.view',
  SALES_CREATE: 'sales.create',
  SALES_UPDATE: 'sales.update',

  // Finance
  FINANCE_VIEW: 'finance.view',
  FINANCE_CREATE: 'finance.create',

  // HR
  HR_VIEW: 'hr.view',
  HR_CREATE: 'hr.create',
  HR_UPDATE: 'hr.update',
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_PROCESS: 'payroll.process',

  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  // Admin
  USERS_MANAGE: 'users.manage',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role → permissions map
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: Object.values(PERMISSIONS), // admin gets everything
  manager: [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_UPDATE,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.PROCUREMENT_VIEW,
    PERMISSIONS.PROCUREMENT_CREATE,
    PERMISSIONS.PROCUREMENT_UPDATE,
    PERMISSIONS.PRODUCTION_VIEW,
    PERMISSIONS.PRODUCTION_CREATE,
    PERMISSIONS.PRODUCTION_UPDATE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_UPDATE,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.HR_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
  ],
  staff: [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.PROCUREMENT_VIEW,
    PERMISSIONS.PRODUCTION_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
};
