import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './models.js';

const config = loadConfig();
try {
  await connectDatabase(config.mongoUri);
} catch (error) {
  console.error('MongoDB startup failed:', error.name);
  process.exit(1);
}
const { server, io } = createApp(config);
server.listen(config.port, config.production ? '0.0.0.0' : '127.0.0.1', () => console.log(`Fieldnote API listening on port ${config.port}`));

function shutdown() {
  io.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
