import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';

async function main() {
  const supplied = process.argv[2];
  if (!supplied) throw new Error('Cần URL HTTPS do chủ dự án truyền: npx tsx scripts/smoke-public.ts https://domain');
  const url = new URL(supplied);
  assert.equal(url.protocol, 'https:', 'Chỉ nhận HTTPS.');
  assert.ok(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash);
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0', 'Không cho phép bỏ kiểm tra TLS.');
  const get = (path: string) => fetch(new URL(path, url), { redirect: 'error', signal: AbortSignal.timeout(15000) });
  const home = await get('/'); assert.equal(home.status, 200); assert.match(await home.text(), /Long Fish/);
  for (const header of ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'content-security-policy']) assert.ok(home.headers.get(header), header);
  assert.deepEqual(await (await get('/api/health')).json(), { ok: true });
  const catalog = await (await get('/api/products')).json() as { images: string[] }[];
  assert.ok(catalog.length > 0, 'Cần ít nhất một sản phẩm đã nhập trước smoke.');
  const image = catalog.flatMap(row => row.images).find(src => src.startsWith('/'));
  assert.ok(image); const picture = await get(image); assert.equal(picture.status, 200); assert.match(picture.headers.get('content-type') || '', /image\//);
  assert.equal((await get('/api/internal/products/search')).status, 404);
  assert.equal((await get('/rest/settings')).status, 404);
  assert.equal((await get('/webhook/order-created')).status, 404);
  const token = process.env.META_VERIFY_TOKEN;
  assert.ok(token, 'Cần META_VERIFY_TOKEN để kiểm verify đúng/sai; không gửi tin thật.');
  const challenge = randomUUID();
  const verify = (value: string) => get('/webhook/messenger?' + new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': value, 'hub.challenge': challenge }));
  const valid = await verify(token); assert.equal(valid.status, 200); assert.equal(await valid.text(), challenge);
  assert.equal((await verify(randomUUID())).status, 403);
  console.log('PASS HTTPS/TLS, home, health, image, headers, private routes and Meta verification (no messages sent).');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Smoke failed'); process.exitCode = 1; });
