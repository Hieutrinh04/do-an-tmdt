import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:18080';
const project = process.env.E2E_COMPOSE_PROJECT;
const docker = (args: string[]) => execFileSync('docker', ['compose', '-p', project!, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
async function main() {
  if (!project?.startsWith('long-fish-e2e')) throw new Error('Cần E2E_COMPOSE_PROJECT riêng.');
  const port = docker(['port', 'frontend', '80']).split(':').at(-1);
  if (new URL(base).port !== port || port === '8080') throw new Error('TEST_BASE_URL không trỏ tới stack kiểm thử.');
  if (docker(['exec', '-T', 'backend', 'node', '-e', "process.stdout.write(process.env.MOCK_INTEGRATIONS || 'true')"]) === 'false') throw new Error('Chỉ chạy thử trên demo mock.');
  const password = docker(['exec', '-T', 'backend', 'node', '-e', "process.stdout.write(process.env.ADMIN_PASSWORD || require('node:fs').readFileSync('/data/admin-password','utf8').trim())"]);
  const username = docker(['exec', '-T', 'backend', 'node', '-e', "process.stdout.write(process.env.ADMIN_USERNAME || 'admin')"]);
  const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(login.status, 200);
  const { token } = await login.json() as { token: string };
  const upload = async (bytes: Buffer, filename: string, expected: number, authenticated = true) => {
    const form = new FormData(); form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), filename);
    const response = await fetch(base + '/api/admin/uploads', { method: 'POST', headers: authenticated ? { Authorization: 'Bearer ' + token } : {}, body: form });
    assert.equal(response.status, expected);
    return response.json() as Promise<{ file: string }>;
  };
  const image = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#50828a' } }).png().toBuffer();
  await upload(image, 'test.png', 401, false);
  await upload(Buffer.from('fake'), 'fake.png', 415);
  await upload(Buffer.alloc(5 * 1024 * 1024 + 1), 'oversize.png', 413);
  const { file } = await upload(image, 'test.png', 201);
  const slug = 'upload-test-' + Date.now();
  const response = await fetch(base + '/api/admin/products', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'TEST ảnh upload', slug, description: 'Tệp kiểm thử tổng hợp', price: 1000, category: 'Kiểm thử', images: [file] }) });
  assert.equal(response.status, 201);
  const product = await response.json() as { id: string };
  try {
    const credits = await (await fetch(base + '/api/photo-credits')).json() as { slug: string; file: string }[];
    assert.ok(credits.some(row => row.slug === slug && row.file === file));
    for (const [path, width] of [[file, 1200], [file.replace('.webp', '-thumb.webp'), 480]] as const) {
      const result = await fetch(base + path);
      assert.equal(result.status, 200); assert.match(result.headers.get('content-type') || '', /image\/webp/);
      assert.match(result.headers.get('cache-control') || '', /immutable/);
      const bytes = Buffer.from(await result.arrayBuffer());
      assert.ok(bytes.length <= 250000);
      assert.equal((await sharp(bytes).metadata()).width, width);
    }
    docker(['restart', 'backend']);
    let healthy = false;
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(base + '/api/health')).ok) { healthy = true; break; } } catch {}
      await delay(1000);
    }
    assert.ok(healthy);
    assert.equal((await fetch(base + file)).status, 200);
    await writeFile('docs/upload-verification.json', JSON.stringify({ at: new Date().toISOString(), result: 'PASS',
      checks: ['JWT', 'magic bytes', '5 MB', 'WebP 1200', 'thumb 480', 'credits API', 'volume sau restart backend'], file }, null, 2) + '\n');
    console.log('PASS · Upload qua Nginx, ghi nguồn và giữ ảnh sau restart backend.');
  } finally {
    const result = await fetch(base + '/api/admin/products/' + product.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    assert.equal(result.status, 204);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
