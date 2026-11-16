import mongoose from 'mongoose';
import { hash } from 'bcryptjs';
import { User, UserSchema } from '../modules/users/user.schema.js';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL?.toLowerCase().trim();
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const ADMIN_NAME = process.env.E2E_ADMIN_NAME ?? 'E2E Admin';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('E2E admin setup is disabled in production');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri);
  const UserModel = mongoose.model(User.name, UserSchema);
  const passwordHash = await hash(ADMIN_PASSWORD, 12);
  const existing = await UserModel.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    existing.role = 'ADMIN';
    existing.status = 'ACTIVE';
    existing.emailVerifiedAt = existing.emailVerifiedAt ?? new Date();
    existing.fullName = existing.fullName || ADMIN_NAME;
    if (process.env.E2E_ADMIN_RESET_PASSWORD === 'YES') {
      existing.passwordHash = passwordHash;
    }
    await existing.save();
    console.log(`Updated existing user ${ADMIN_EMAIL} as ADMIN (password reset: ${process.env.E2E_ADMIN_RESET_PASSWORD === 'YES' ? 'yes' : 'no'})`);
  } else {
    await UserModel.create({
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      tokenVersion: 0,
    });
    console.log(`Created ADMIN ${ADMIN_EMAIL}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('ensure-e2e-admin failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
