import '../common/mongo-dns.js';
import mongoose from 'mongoose';
import { User, UserSchema } from '../modules/users/user.schema.js';

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email || process.env.ADMIN_CONFIRM !== 'YES') throw new Error('Set ADMIN_EMAIL and ADMIN_CONFIRM=YES to explicitly grant an existing verified account');
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/fashion_commerce';
  await mongoose.connect(uri);
  const UserModel = mongoose.model(User.name, UserSchema);
  const user = await UserModel.findOne({email, status:'ACTIVE', emailVerifiedAt: {$ne:null}});
  if (!user) throw new Error('Only an existing verified, active account can receive initial Admin role');
  if (user.role === 'ADMIN') { console.log('Already Admin'); return; }
  const existingAdmin = await UserModel.countDocuments({role:'ADMIN',status:'ACTIVE'});
  if (existingAdmin > 0) throw new Error('Admin already exists. Use an audited admin management workflow; bootstrap only initial Admin.');
  user.role='ADMIN'; await user.save();
  console.log(`Initial Admin assigned to ${email}; record this action in deployment audit log`);
}
main().catch(e=>{console.error('Bootstrap failed:', e.message);process.exitCode=1;}).finally(()=>mongoose.disconnect());
