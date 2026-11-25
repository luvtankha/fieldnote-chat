import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const id = Schema.Types.ObjectId;
export const categories = ['casual', 'professional', 'creative'];
export const themes = ['system', 'light', 'dark'];

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  settings: {
    assistantName: { type: String, default: 'Fieldnote' },
    theme: { type: String, enum: themes, default: 'system' }
  }
}, { timestamps: true });

const sessionSchema = new Schema({
  user: { type: id, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

const conversationSchema = new Schema({
  owner: { type: id, ref: 'User', required: true },
  title: { type: String, required: true },
  titled: { type: Boolean, default: false },
  category: { type: String, enum: categories, required: true }
}, { timestamps: true });
conversationSchema.index({ owner: 1, updatedAt: -1, _id: -1 });
conversationSchema.index({ createdAt: -1 });

const turnSchema = new Schema({
  owner: { type: id, ref: 'User', required: true },
  conversation: { type: id, ref: 'Conversation', required: true },
  requestId: { type: String, required: true },
  input: { type: String, required: true },
  answer: String,
  status: { type: String, enum: ['pending', 'complete', 'failed'], required: true },
  leasedUntil: Date,
  latencyMs: Number,
  cached: Boolean,
  error: String,
  rating: { type: Number, enum: [-1, 1, null], default: null },
  feedback: { type: String, default: '' }
}, { timestamps: true });
turnSchema.index({ conversation: 1, requestId: 1 }, { unique: true });
turnSchema.index({ conversation: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
turnSchema.index({ conversation: 1, _id: -1 });
turnSchema.index({ createdAt: -1 });

const bucketSchema = new Schema({
  _id: String,
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});

export const User = model('User', userSchema);
export const Session = model('Session', sessionSchema);
export const Conversation = model('Conversation', conversationSchema);
export const Turn = model('Turn', turnSchema);
export const RateBucket = model('RateBucket', bucketSchema);

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User, Session, Conversation, Turn, RateBucket].map((collection) => collection.init()));
}
