import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  if (!process.argv.includes('--docker')) { await import('../backend/src/backup'); return; }
  const filename = 'long-fish-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db';
  const directory = resolve(process.env.BACKUP_DIR || 'data/backups');
  await mkdir(directory, { recursive: true });
  const result = spawnSync('docker', ['compose', 'exec', '-T', '-e', 'BACKUP_DIR=/data/backups', 'backend', 'node', 'dist/src/backup.js'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Không tạo được backup trong container.');
  const file = result.stdout.match(/OK · (\/data\/backups\/long-fish-[\w.-]+\.db)/)?.[1];
  if (!file) throw new Error('Không tìm thấy đường dẫn bản sao.');
  const copy = spawnSync('docker', ['compose', 'cp', 'backend:' + file, resolve(directory, filename)], { stdio: 'inherit' });
  if (copy.error) throw copy.error;
  if (copy.status !== 0) throw new Error('Không lấy được bản sao từ container.');
  console.log('OK · ' + resolve(directory, filename));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
