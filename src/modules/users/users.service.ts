import { User } from './users.model';
import { AppError } from '../../common/utils/errors';

export async function getAllUsers() {
  return User.find().sort({ createdAt: -1 });
}

export async function getUserById(id: string) {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);
  return user;
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'staff';
}) {
  const exists = await User.findOne({ email: data.email });
  if (exists) throw new AppError('Email already in use', 409);
  return User.create(data);
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: 'admin' | 'manager' | 'staff'; isActive?: boolean },
) {
  const user = await User.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

export async function changePassword(id: string, currentPassword: string, newPassword: string) {
  const user = await User.findById(id).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new AppError('Current password is incorrect', 400);

  user.password = newPassword;
  await user.save();
}
