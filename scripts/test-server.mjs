import { testGenerate, testStack } from '../backend/test/helpers.js';

const live = Boolean(process.env.AI_BASE_URL || process.env.OPENAI_API_KEY);
const options = {
  port: Number(process.env.FIELDNOTE_TEST_PORT || 4400),
  origin: process.env.FIELDNOTE_TEST_ORIGIN || 'http://127.0.0.1:3400',
  ...(live ? { ai: { apiKey: process.env.OPENAI_API_KEY || 'local-model', baseURL: process.env.AI_BASE_URL, model: process.env.AI_MODEL } } : { generate: testGenerate })
};
const server = await testStack(options);
console.log(`Fieldnote isolated test API ready on ${server.url} (${live ? 'live model' : 'test fixture'})`);
const stop = async () => { await server.close(); process.exit(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
