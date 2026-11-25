export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origins = new Set((env.APP_ORIGINS || (production ? '' : 'http://localhost:3000,http://127.0.0.1:3000'))
    .split(',').map((value) => value.trim()).filter(Boolean));
  if (!origins.size || [...origins].some((value) => {
    const url = new URL(value);
    return url.origin !== value || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:');
  })) throw new Error('APP_ORIGINS must contain exact frontend origins. Production requires HTTPS.');
  if ((env.JWT_SECRET || '').length < 32) throw new Error('Set JWT_SECRET to at least 32 random characters.');
  if (!env.MONGODB_URI) throw new Error('Set MONGODB_URI.');
  if (!env.OPENAI_API_KEY && !env.AI_BASE_URL) throw new Error('Set OPENAI_API_KEY or AI_BASE_URL.');
  const integer = (key, fallback, min, max) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}.`);
    return value;
  };
  return {
    production, origins, jwtSecret: env.JWT_SECRET, mongoUri: env.MONGODB_URI,
    port: integer('PORT', 4000, 1, 65535), trustProxy: integer('TRUST_PROXY', 0, 0, 8),
    userLimit: integer('CHAT_USER_LIMIT', 12, 1, 400), globalLimit: integer('CHAT_GLOBAL_LIMIT', 60, 1, 10000),
    ai: { apiKey: env.OPENAI_API_KEY || 'ollama', baseURL: env.AI_BASE_URL || undefined, model: env.AI_MODEL || 'gpt-4.1-mini' }
  };
}
