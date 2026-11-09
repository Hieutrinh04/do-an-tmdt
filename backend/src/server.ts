import { createApp } from './app';
import { db } from './db';
import { env } from './env';
import { startOutbox } from './outbox';

const server = createApp().listen(Number(env.PORT || 3001), '0.0.0.0', () => {
  console.info('API đang chạy trên cổng ' + (env.PORT || 3001));
});
const stopOutbox = startOutbox();
function shutdown() {
  stopOutbox();
  server.close(() => { void db.$disconnect(); });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

