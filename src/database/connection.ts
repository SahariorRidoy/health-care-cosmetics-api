import mongoose from 'mongoose';
import { config } from '../config';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) return;
  try {
    await mongoose.connect(config.mongoUri);
    isConnected = true;
    console.info(`MongoDB connected: ${mongoose.connection.host}`);
    await dropStaleIndexes();
    await runSeedIfNeeded();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

async function dropStaleIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const stale: Array<{ collection: string; index: string }> = [
    { collection: 'suppliers', index: 'code_1' },
    { collection: 'suppliers', index: 'email_1' },
  ];
  for (const { collection, index } of stale) {
    try {
      await db.collection(collection).dropIndex(index);
      console.info(`✓ Dropped stale index ${index} from ${collection}`);
    } catch {
      // index doesn't exist — safe to ignore
    }
  }
}

async function runSeedIfNeeded(): Promise<void> {
  // Dynamically import to avoid circular deps
  const { User } = await import('../modules/users/users.model');
  const count = await User.countDocuments();
  if (count === 0) {
    await User.create({
      name: 'Admin',
      email: 'admin@hcc.com',
      password: 'Admin@123456',
      role: 'admin',
      isActive: true,
    });
    console.info('✓ Default admin seeded: admin@hcc.com / Admin@123456');
    console.info('⚠ Change the password immediately after first login!');
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.info('MongoDB disconnected');
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err);
});
