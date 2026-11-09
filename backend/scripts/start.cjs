const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');

mkdirSync('/data', { recursive: true });
mkdirSync('/shared', { recursive: true });
function secret(name, file, directory) {
  if (process.env[name]) return;
  if (process.env.MOCK_INTEGRATIONS === 'false' && !(name === 'ADMIN_PASSWORD' && process.env.SEED_DEMO === 'false')) {
    throw new Error(name + ' phải được cấu hình trong chế độ tích hợp thật.');
  }
  if (name === 'ADMIN_PASSWORD' && process.env.SEED_DEMO === 'false') return;
  const path = directory + '/' + file;
  try {
    writeFileSync(path, randomBytes(24).toString('hex') + '\n', {
      flag: 'wx', mode: directory === '/shared' ? 0o644 : 0o600,
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  process.env[name] = readFileSync(path, 'utf8').trim();
}
secret('ADMIN_PASSWORD', 'admin-password', '/data');
secret('JWT_SECRET', 'jwt-secret', '/data');
secret('INTERNAL_API_KEY', 'api-key', '/shared');
secret('N8N_WEBHOOK_SECRET', 'webhook-secret', '/shared');
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:/data/store.db';
const setup = spawnSync(process.execPath, ['scripts/database.cjs', 'setup'], { stdio: 'inherit' });
if (setup.error) throw setup.error;
if (setup.status !== 0) process.exit(setup.status ?? 1);

const server = spawn(process.execPath, ['dist/src/server.js'], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('error', error => { console.error(error); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 1; });
