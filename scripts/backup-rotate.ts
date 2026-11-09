import { execFileSync } from 'node:child_process';
import { mkdir, readdir, lstat, rm, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import assert from 'node:assert/strict';

async function main() {
  const project = process.env.COMPOSE_PROJECT_NAME || 'long-fish';
  assert.match(project, /^long-fish(?:-[a-z0-9]+)*$/);
  const root = resolve(process.env.BACKUP_ROOT || 'data/backups/daily');
  await mkdir(root, { recursive: true });
  const canonical = await realpath(root);
  const directory = join(canonical, new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(directory);
  const run = (args: string[]) => execFileSync('docker', ['compose', '-p', project, ...args], { encoding: 'utf8' }).trim();
  const output = run(['exec', '-T', '-e', 'BACKUP_DIR=/data/backups', 'backend', 'node', 'dist/src/backup.js']);
  const snapshot = output.match(/\/data\/backups\/long-fish-[\w.-]+\.db/)?.[0];
  assert.ok(snapshot);
  run(['cp', 'backend:' + snapshot, join(directory, 'store.db')]);
  run(['exec', '-T', 'backend', 'tar', '-C', '/uploads-data', '-cf', '/data/backups/daily-uploads.tar', '.']);
  run(['cp', 'backend:/data/backups/daily-uploads.tar', join(directory, 'uploads.tar')]);
  const names = (await readdir(canonical)).filter(name => /^\d{4}-\d\d-\d\dT[\d-]+Z$/.test(name)).sort().reverse();
  for (const name of names.slice(14)) {
    const target = resolve(canonical, name);
    assert.equal(dirname(target), canonical);
    const info = await lstat(target);
    if (info.isDirectory() && !info.isSymbolicLink() && dirname(await realpath(target)) === canonical) await rm(target, { recursive: true });
  }
  console.log('Backup DB và uploads hoàn tất; giữ tối đa 14 thư mục timestamp.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
