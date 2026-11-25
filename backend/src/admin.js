import mongoose from 'mongoose';
import { connectDatabase, User } from './models.js';

const [email, role = 'admin'] = process.argv.slice(2);
if (!email || !process.env.MONGODB_URI || !['admin', 'user'].includes(role)) {
  console.error('Set MONGODB_URI and run npm run admin -w backend -- account@example.com [admin|user].');
  process.exit(1);
}
try {
  await connectDatabase(process.env.MONGODB_URI);
  const result = await User.updateOne({ email: email.trim().toLowerCase() }, { role });
  if (!result.matchedCount) {
    console.error('No matching account. Sign up before assigning a role.');
    process.exitCode = 1;
  } else {
    console.log(`Account role set to ${role}.`);
  }
} finally {
  await mongoose.disconnect();
}
