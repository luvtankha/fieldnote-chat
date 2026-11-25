import { setTimeout as delay } from 'node:timers/promises';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/models.js';

export async function testStack({ port = 0, origin = 'http://127.0.0.1:3400', generate, ai, production = false } = {}) {
  const db = await MongoMemoryServer.create({ binary: { version: '8.0.12' } });
  await connectDatabase(db.getUri('fieldnote_test'));
  const config = {
    production, origins: new Set([origin]), jwtSecret: 'testing-secret-only-for-the-isolated-test-database',
    trustProxy: 0, userLimit: 20, globalLimit: 80, ai: ai || { model: 'test-provider' }
  };
  const app = createApp(config, generate);
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(port, '127.0.0.1', resolve);
  });
  return {
    ...app, origin, url: `http://127.0.0.1:${app.server.address().port}`,
    async close() {
      await app.io.close();
      await mongoose.disconnect();
      await db.stop();
    }
  };
}

export async function testGenerate(messages, push) {
  const input = messages.at(-1).content;
  await delay(180);
  push('Test reply');
  await delay(180);
  return `Test reply for: ${input}`;
}
