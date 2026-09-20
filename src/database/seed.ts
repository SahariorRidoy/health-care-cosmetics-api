import { connectDatabase, disconnectDatabase } from './connection';
import { User } from '../modules/users/users.model';
import { ExpenseCategory } from '../modules/finance/expenseCategory.model';
import { Department } from '../modules/hr/department.model';
import { Employee } from '../modules/hr/employee.model';

const EMPLOYEES = [
  { name: 'Sara Ahmed', email: 'sara.ahmed@hcc.com', phone: '0300-1111001', designation: 'HR Manager', department: 'Human Resources', joiningDate: '2022-01-10', currentSalary: 85000 },
  { name: 'Bilal Khan', email: 'bilal.khan@hcc.com', phone: '0300-1111002', designation: 'Accountant', department: 'Finance & Accounts', joiningDate: '2021-06-15', currentSalary: 70000 },
  { name: 'Ayesha Malik', email: 'ayesha.malik@hcc.com', phone: '0300-1111003', designation: 'Sales Executive', department: 'Sales & Marketing', joiningDate: '2022-03-01', currentSalary: 60000 },
  { name: 'Usman Tariq', email: 'usman.tariq@hcc.com', phone: '0300-1111004', designation: 'Production Supervisor', department: 'Production', joiningDate: '2020-09-20', currentSalary: 75000 },
  { name: 'Fatima Noor', email: 'fatima.noor@hcc.com', phone: '0300-1111005', designation: 'Procurement Officer', department: 'Procurement', joiningDate: '2021-11-05', currentSalary: 65000 },
  { name: 'Hassan Raza', email: 'hassan.raza@hcc.com', phone: '0300-1111006', designation: 'Warehouse Supervisor', department: 'Warehouse & Logistics', joiningDate: '2022-07-18', currentSalary: 62000 },
  { name: 'Zara Siddiqui', email: 'zara.siddiqui@hcc.com', phone: '0300-1111007', designation: 'QC Analyst', department: 'Quality Control', joiningDate: '2023-01-02', currentSalary: 58000 },
  { name: 'Omar Sheikh', email: 'omar.sheikh@hcc.com', phone: '0300-1111008', designation: 'IT Administrator', department: 'IT & Systems', joiningDate: '2021-04-12', currentSalary: 80000 },
  { name: 'Nadia Hussain', email: 'nadia.hussain@hcc.com', phone: '0300-1111009', designation: 'Admin Officer', department: 'Administration', joiningDate: '2022-10-25', currentSalary: 55000 },
  { name: 'Kamran Ali', email: 'kamran.ali@hcc.com', phone: '0300-1111010', designation: 'Production Operator', department: 'Production', joiningDate: '2023-03-15', currentSalary: 45000 },
];

const DEPARTMENTS = [
  { name: 'Human Resources', description: 'HR and people management' },
  { name: 'Finance & Accounts', description: 'Financial operations and accounting' },
  { name: 'Sales & Marketing', description: 'Sales, marketing and customer relations' },
  { name: 'Production', description: 'Manufacturing and production operations' },
  { name: 'Procurement', description: 'Purchasing and supplier management' },
  { name: 'Warehouse & Logistics', description: 'Inventory, storage and distribution' },
  { name: 'Quality Control', description: 'Product quality assurance and testing' },
  { name: 'IT & Systems', description: 'Technology and systems administration' },
  { name: 'Administration', description: 'General administration and office management' },
];

const EXPENSE_CATEGORIES = [
  // Production & Raw Materials
  { name: 'Raw Materials', description: 'Purchase of raw materials for production' },
  { name: 'Packaging Materials', description: 'Boxes, bottles, labels and other packaging' },
  { name: 'Production Supplies', description: 'Consumables used in the production process' },
  { name: 'Equipment Maintenance', description: 'Repair and upkeep of production machinery' },
  { name: 'Factory Utilities', description: 'Electricity, gas and water used in the factory' },
  // Operations
  { name: 'Office Supplies', description: 'Stationery, printing and general office items' },
  { name: 'Utilities', description: 'Electricity, gas, water for office and premises' },
  { name: 'Rent & Lease', description: 'Office, warehouse or factory rent payments' },
  { name: 'Internet & Telephone', description: 'Internet, mobile and landline bills' },
  // Logistics & Distribution
  { name: 'Freight & Shipping', description: 'Outbound shipping and courier charges' },
  { name: 'Delivery & Transport', description: 'Local delivery and transportation costs' },
  { name: 'Fuel & Vehicle', description: 'Fuel, vehicle maintenance and running costs' },
  { name: 'Warehouse Costs', description: 'Storage and warehousing expenses' },
  // HR & Admin
  { name: 'Salaries & Wages', description: 'Employee salaries, wages and bonuses' },
  { name: 'Staff Training', description: 'Training, workshops and skill development' },
  { name: 'Recruitment', description: 'Hiring, advertising and onboarding costs' },
  { name: 'Staff Welfare', description: 'Canteen, medical and employee welfare expenses' },
  // Sales & Marketing
  { name: 'Marketing & Advertising', description: 'Digital, print and media advertising' },
  { name: 'Promotional Materials', description: 'Samples, brochures and promotional items' },
  { name: 'Trade Shows & Events', description: 'Exhibition, event and sponsorship costs' },
  { name: 'Sales Commission', description: 'Commission paid to sales staff or agents' },
  // Finance & Legal
  { name: 'Bank Charges & Fees', description: 'Bank transaction fees and service charges' },
  { name: 'Tax & Compliance', description: 'VAT, tax filing and regulatory compliance costs' },
  { name: 'Legal & Professional Fees', description: 'Lawyer, auditor and consultant fees' },
  { name: 'Insurance', description: 'Business, asset and liability insurance premiums' },
  // Other
  { name: 'Repairs & Maintenance', description: 'General repairs and building maintenance' },
  { name: 'Miscellaneous', description: 'Other expenses not covered by specific categories' },
];

async function seed() {
  await connectDatabase();

  const existing = await User.findOne({ email: 'admin@hcc.com' });
  if (!existing) {
    await User.create({
      name: 'Admin',
      email: 'admin@hcc.com',
      password: 'Admin@123456',
      role: 'admin',
      isActive: true,
    });
    console.info('✓ Default admin created: admin@hcc.com / Admin@123456');
    console.info('⚠ Change the password immediately after first login!');
  } else {
    console.info('Admin already exists — skipping');
  }

  for (const cat of EXPENSE_CATEGORIES) {
    await ExpenseCategory.updateOne(
      { name: cat.name },
      { $setOnInsert: { ...cat, isActive: true } },
      { upsert: true },
    );
  }
  console.info(`✓ ${EXPENSE_CATEGORIES.length} expense categories seeded`);

  const admin = await User.findOne({ email: 'admin@hcc.com' });
  for (const dept of DEPARTMENTS) {
    await Department.updateOne(
      { name: dept.name },
      { $setOnInsert: { ...dept, isActive: true, createdBy: admin!._id } },
      { upsert: true },
    );
  }
  console.info(`✓ ${DEPARTMENTS.length} departments seeded`);

  const empCount = await Employee.countDocuments();
  if (empCount === 0) {
    let empIndex = 1;
    for (const emp of EMPLOYEES) {
      const dept = await Department.findOne({ name: emp.department });
      if (!dept) continue;
      await Employee.create({
        employeeId: `EMP-${String(empIndex).padStart(4, '0')}`,
        name: emp.name,
        email: emp.email,
        phone: emp.phone,
        designation: emp.designation,
        department: dept._id,
        joiningDate: new Date(emp.joiningDate),
        currentSalary: emp.currentSalary,
        status: 'ACTIVE',
        isActive: true,
        createdBy: admin!._id,
      });
      empIndex++;
    }
    console.info(`✓ ${EMPLOYEES.length} employees seeded`);
  } else {
    console.info('Employees already exist — skipping');
  }

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
