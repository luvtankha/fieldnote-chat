import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server-core';

const directory = process.env.FIELDNOTE_LOCAL_DB_DIR || (process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Fieldnote', 'mongodb')
  : join(homedir(), '.local', 'share', 'fieldnote', 'mongodb'));
await mkdir(directory, { recursive: true });
const mongo = await MongoMemoryServer.create({
  binary: { version: '8.0.12' },
  instance: { ip: '127.0.0.1', port: 27017, dbPath: directory, storageEngine: 'wiredTiger' }
});
console.log(`Local MongoDB ready on ${mongo.getUri('fieldnote')}`);
const stop = async () => { await mongo.stop({ doCleanup: false }); process.exit(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
