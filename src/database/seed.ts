import { connectDatabase, disconnectDatabase } from './connection';
import { User } from '../modules/users/users.model';

async function seed() {
  await connectDatabase();

  const existing = await User.findOne({ email: 'admin@hcc.com' });
  if (existing) {
    console.info('Admin user already exists — skipping seed');
    await disconnectDatabase();
    return;
  }

  await User.create({
    name: 'Admin',
    email: 'admin@hcc.com',
    password: 'Admin@123456',
    role: 'admin',
    isActive: true,
  });

  console.info('✓ Default admin created: admin@hcc.com / Admin@123456');
  console.info('⚠ Change the password immediately after first login!');

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
