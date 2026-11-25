import { z } from 'zod';
import { categories, themes } from './models.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues[0].message);
  return result.data;
}

const email = z.string().trim().max(254).toLowerCase().pipe(z.email({ error: 'Enter a valid email address.' }));
const password = z.string().min(12, 'Use at least 12 characters for your password.').max(128);
const name = z.string().trim().min(1, 'Enter a name.').max(40);
export const signup = z.strictObject({ name, email, password });
export const login = z.strictObject({ email, password: z.string().min(1).max(128) });
export const settings = z.strictObject({ assistantName: name, theme: z.enum(themes) });
export const conversation = z.strictObject({ category: z.enum(categories) });
export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid record ID.');
export const message = z.strictObject({
  conversationId: objectId,
  requestId: z.uuid(),
  text: z.string().trim().min(1, 'Write a message first.').max(4000, 'Keep messages under 4,000 characters.')
});
export const rating = z.strictObject({ rating: z.union([z.literal(1), z.literal(-1), z.null()]), feedback: z.string().trim().max(500).default('') });
export const pagination = z.strictObject({
  before: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40)
});

export function errorPayload(error) {
  if (error instanceof HttpError) return { status: error.status, error: error.message };
  if (error.type === 'entity.parse.failed') return { status: 400, error: 'Invalid JSON.' };
  if (error.type === 'entity.too.large') return { status: 413, error: 'The request is too large.' };
  console.error('Request failed:', error.name, error.code || '');
  return { status: 500, error: 'Something went wrong. Please try again.' };
}
