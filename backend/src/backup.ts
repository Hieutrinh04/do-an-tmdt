import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { env } from './env';
import { db } from './db';

async function main() {
  if (!env.DATABASE_URL?.startsWith('file:')) throw new Error('db:backup chỉ hỗ trợ SQLite. Dùng pg_dump cho PostgreSQL.');
  const directory = resolve(env.BACKUP_DIR || '../data/backups');
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'long-fish-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
  await db.$executeRawUnsafe("VACUUM INTO '" + file.replaceAll("'", "''") + "'");
  console.log('OK · ' + file);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
