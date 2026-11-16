import mongoose from 'mongoose';
import { hash } from 'bcryptjs';
import { User, UserSchema } from '../modules/users/user.schema.js';

// Local development only: creates (or resets) one admin and one customer account.
const ACCOUNTS = [
  { email: 'admin.test@example.com', fullName: 'Admin Test', password: 'TestAdmin2026', role: 'ADMIN' as const },
  { email: 'khach.test@example.com', fullName: 'Khach Test', password: 'TestKhach2026', role: 'CUSTOMER' as const },
];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Test account setup is disabled in production');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri);
  const UserModel = mongoose.model(User.name, UserSchema);
  for (const account of ACCOUNTS) {
    const passwordHash = await hash(account.password, 12);
    const existing = await UserModel.findOne({ email: account.email });
    if (existing) {
      existing.role = account.role;
      existing.status = 'ACTIVE';
      existing.emailVerifiedAt = existing.emailVerifiedAt ?? new Date();
      existing.fullName = existing.fullName || account.fullName;
      existing.passwordHash = passwordHash;
      await existing.save();
      console.log(`Updated ${account.role}: ${account.email}`);
    } else {
      await UserModel.create({
        email: account.email,
        fullName: account.fullName,
        passwordHash,
        role: account.role,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        tokenVersion: 0,
      });
      console.log(`Created ${account.role}: ${account.email}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error('create-test-users failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
