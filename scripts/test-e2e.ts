import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const project = process.env.E2E_COMPOSE_PROJECT;
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:18080';
const webhook = (process.env.TEST_N8N_URL || 'http://127.0.0.1:15678') + '/webhook/messenger';
const rows: { scenario: string; result: string; note: string }[] = [];
const run = 'demo-' + Date.now();
const startedAt = new Date().toISOString();
let token = '';
const docker = (args: string[]) => execFileSync('docker', ['compose', '-p', project!, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
async function request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, expected, path + ' · ' + (data?.message || ''));
  return data;
}
async function check(scenario: string, action: () => Promise<string | void>) {
  try { const note = await action(); rows.push({ scenario, result: 'PASS', note: note || 'Đã chạy qua HTTP.' }); }
  catch (error) { rows.push({ scenario, result: 'FAIL', note: (error as Error).message.replace(/\|/g, '/') }); process.exitCode = 1; }
}

async function main() {
  if (!project?.startsWith('long-fish-e2e')) throw new Error('E2E_COMPOSE_PROJECT phải là project kiểm thử riêng.');
  const port = docker(['port', 'frontend', '80']).split(':').at(-1);
  if (new URL(base).port !== port || new URL(base).port === '8080') throw new Error('TEST_BASE_URL không trỏ tới project kiểm thử.');
  const n8nPort = docker(['port', 'n8n', '5678']).split(':').at(-1);
  if (new URL(webhook).port !== n8nPort || n8nPort === '5678') throw new Error('TEST_N8N_URL không trỏ tới project kiểm thử.');
  const mode = docker(['exec', '-T', 'backend', 'node', '-e', "console.log(process.env.MOCK_INTEGRATIONS || 'true')"]);
  if (mode === 'false') throw new Error('Chỉ chạy kịch bản tạo dữ liệu mẫu khi MOCK_INTEGRATIONS=true.');
  const password = docker(['exec', '-T', 'backend', 'node', '-e', "process.stdout.write(process.env.ADMIN_PASSWORD || require('node:fs').readFileSync('/data/admin-password','utf8').trim())"]);
  const username = docker(['exec', '-T', 'backend', 'node', '-e', "process.stdout.write(process.env.ADMIN_USERNAME || 'admin')"]);
  token = (await request('/admin/login', { username, password })).token;
  const policy = await request('/shipping/policy');
  const product = await request('/admin/products', { name: 'Betta kiểm thử ' + run, slug: run, description: 'Dữ liệu giả phục vụ kiểm thử. ',
    price: 69001, category: 'Betta', images: ['/catalog/betta.svg'], isLiveFish: true }, 'POST', 201);
  const variant = await request('/admin/products/' + product.id + '/variants', { sku: run, color: 'Đỏ', size: '3–4 cm', gender: 'Đực', unit: 'con', stock: 5, minQty: 2 }, 'POST', 201);
  const orderInput = { customerName: 'Khách kiểm thử Long Fish', phone: '0900000001', province: policy.liveProvinces[0], district: 'Quận kiểm thử', address: 'Địa chỉ giả phục vụ đồ án',
    psid: '1888' + String(Date.now()),
    paymentMethod: 'COD', doaAccepted: true, note: 'TEST ' + run, items: [{ variantId: variant.id, quantity: 2 }] };
  const created: string[] = [];
  let cod: any;
  try {
    await check('MinQty, vượt tồn và vùng không giao cá sống', async () => {
      await request('/orders', { ...orderInput, items: [{ variantId: variant.id, quantity: 1 }] }, 'POST', 422);
      await request('/orders', { ...orderInput, items: [{ variantId: variant.id, quantity: 6 }] }, 'POST', 409);
      await request('/orders', { ...orderInput, province: 'An Giang' }, 'POST', 422);
      await request('/orders', { ...orderInput, doaAccepted: false }, 'POST', 422);
    });
    await check('COD, tiền nguyên VND và tồn kho giảm đúng', async () => {
      cod = await request('/orders', orderInput, 'POST', 201); created.push(cod.code);
      assert.equal(cod.subtotal, 138002);
      assert.equal(cod.total, cod.subtotal + cod.shippingFee + cod.packingFee);
      assert.ok(Number.isInteger(cod.total));
      const current = await request('/products/' + run);
      assert.equal(current.variants[0].stock, 3);
      return cod.code;
    });
    await check('VietQR đúng số tiền và nội dung, hủy hoàn kho', async () => {
      const qr = await request('/orders', { ...orderInput, paymentMethod: 'BANK_QR' }, 'POST', 201); created.push(qr.code);
      const url = new URL(qr.qrUrl);
      assert.equal(url.searchParams.get('amount'), String(qr.total)); assert.equal(url.searchParams.get('addInfo'), qr.code);
      const page = await request('/admin/orders?q=' + qr.code);
      await request('/admin/orders/' + page.orders[0].id + '/status', { status: 'CANCELLED' }, 'PATCH');
      assert.equal((await request('/products/' + run)).variants[0].stock, 3);
    });
    await check('Chuỗi trạng thái, timeline, số điện thoại tra cứu sai', async () => {
      assert.ok(cod);
      const page = await request('/admin/orders?q=' + cod.code);
      for (const status of ['CONFIRMED', 'SHIPPING', 'DELIVERED']) await request('/admin/orders/' + page.orders[0].id + '/status', { status }, 'PATCH');
      const tracked = await request('/orders/track?code=' + cod.code + '&phone=0900000001');
      assert.deepEqual(tracked.history.map((row: any) => row.toStatus), ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED']);
      await request('/orders/track?code=' + cod.code + '&phone=0900000002', undefined, 'GET', 404);
    });
    await check('Tám khách tranh món cuối, chỉ một đơn thành công', async () => {
      await request('/admin/products/' + product.id + '/variants/' + variant.id, { stock: 2 }, 'PATCH');
      const results = await Promise.all(Array.from({ length: 8 }, () => fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderInput) })));
      assert.deepEqual(results.map(r => r.status).sort(), [201, ...Array(7).fill(409)]);
      for (const response of results) { const data = await response.json(); if (response.ok) created.push(data.code); }
      assert.equal((await request('/products/' + run)).variants[0].stock, 0);
    });
    await check('Dashboard khớp dữ liệu đơn hiện tại', async () => {
      const stats = await request('/admin/stats/overview');
      const query = "const {db}=require('./dist/src/db.js');db.order.findMany({include:{items:true}}).then(x=>console.log(JSON.stringify(x))).finally(()=>db.$disconnect())";
      const orders = JSON.parse(docker(['exec', '-T', 'backend', 'node', '-e', query]));
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      const delivered = orders.filter((o: any) => o.status === 'DELIVERED');
      const key = (s: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(s));
      assert.equal(stats.todayRevenue, delivered.filter((o: any) => key(o.createdAt) === today).reduce((n: number, o: any) => n + o.total, 0));
      assert.equal(stats.monthRevenue, delivered.filter((o: any) => key(o.createdAt).startsWith(today.slice(0, 7))).reduce((n: number, o: any) => n + o.total, 0));
      assert.equal(stats.total.orders, stats.total.cancelled + stats.total.delivered + stats.total.processing);
      const periodOrders = orders.filter((o: any) => key(o.createdAt) >= stats.daily[0].period && key(o.createdAt) <= today);
      assert.equal(stats.total.orders, periodOrders.length);
      assert.equal(stats.total.cancelled, periodOrders.filter((o: any) => o.status === 'CANCELLED').length);
      assert.equal(stats.total.delivered, periodOrders.filter((o: any) => o.status === 'DELIVERED').length);
      assert.equal(stats.total.processing, periodOrders.filter((o: any) => !['CANCELLED', 'DELIVERED'].includes(o.status)).length);
      const categories = new Map<string, number>();
      const top = new Map<string, { id: string; name: string; quantity: number; revenue: number }>();
      const products = await request('/admin/products');
      for (const order of periodOrders.filter((o: any) => o.status === 'DELIVERED')) for (const item of order.items) {
        const revenue = item.unitPrice * item.quantity;
        categories.set(item.category, (categories.get(item.category) || 0) + revenue);
        if (!item.isLiveFish) continue;
        const product = products.find((p: any) => p.variants.some((v: any) => v.id === item.variantId));
        assert.ok(product);
        const row = top.get(product.id) || { id: product.id, name: item.productName, quantity: 0, revenue: 0 };
        row.quantity += item.quantity; row.revenue += revenue; top.set(product.id, row);
      }
      const byName = (a: any, b: any) => a.name.localeCompare(b.name);
      assert.deepEqual([...stats.categories].sort(byName), [...categories].map(([name, revenue]) => ({ name, revenue })).sort(byName));
      for (const row of stats.top) assert.deepEqual(row, top.get(row.id));
    });
    await check('n8n tắt, đơn vẫn tạo và outbox gửi lại khi bật', async () => {
      await request('/admin/products/' + product.id + '/variants/' + variant.id, { stock: 2 }, 'PATCH');
      docker(['stop', 'n8n']);
      let offline: any;
      try { offline = await request('/orders', orderInput, 'POST', 201); created.push(offline.code); await delay(1800); }
      finally { docker(['start', 'n8n']); }
      for (let i = 0; i < 45; i++) {
        const csv = docker(['exec', '-T', 'backend', 'node', '-e', "try{process.stdout.write(require('node:fs').readFileSync('/data/mock/Long_Fish_Orders.csv','utf8'))}catch{}"]);
        if (csv.includes(offline.code)) {
          const logs = docker(['logs', '--since=' + startedAt, 'backend']);
          assert.ok(logs.includes('[Email mock] [Long Fish] Đơn mới ' + offline.code), 'Chưa thấy log email đơn mới.');
          assert.ok(logs.includes('Long Fish đã nhận đơn ' + offline.code), 'Chưa thấy tin Messenger xác nhận.');
          return 'Đơn ' + offline.code + ' vào CSV, có log email và Messenger sau khi n8n bật lại.';
        }
        await delay(2000);
      }
      throw new Error('Chưa thấy đơn offline trong CSV sau 90 giây.');
    });
    await check('Chat qua webhook n8n, phân loại và handoff hai lần', async () => {
      const psid = '1999' + String(Date.now());
      for (const text of ['Xin chào', 'cá dễ nuôi cho người mới', 'Betta Halfmoon', 'Đỏ', '3–4 cm', 'Đực', '2', 'zzzzzz', 'xxxxxx']) {
        const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ object: 'page', entry: [{ messaging: [{ sender: { id: psid }, message: { mid: randomUUID(), text } }] }] }), signal: AbortSignal.timeout(20000) });
        assert.ok(response.ok);
        await delay(700);
      }
      let handoff;
      for (let i = 0; i < 20; i++) {
        const handoffs = await request('/admin/handoffs');
        handoff = handoffs.find((h: any) => h.psid === psid);
        if (handoff) break;
        await delay(500);
      }
      assert.ok(handoff);
      const logs = docker(['logs', '--since=' + startedAt, 'backend']);
      assert.ok(/quantity=2/.test(logs) && /psid=1999/.test(logs), 'Chưa thấy link chốt đơn kèm PSID và số lượng.');
      await request('/admin/handoffs/' + handoff.id, { status: 'DONE' }, 'PATCH');
      const query = "const {db}=require('./dist/src/db.js');db.conversationState.findUnique({where:{psid:'" + psid + "'}}).then(x=>console.log(JSON.stringify({handoff:x.handoff,unknownCount:x.unknownCount}))).finally(()=>db.$disconnect())";
      assert.deepEqual(JSON.parse(docker(['exec', '-T', 'backend', 'node', '-e', query])), { handoff: false, unknownCount: 0 });
      const previousReplies = (docker(['logs', '--since=' + startedAt, 'backend']).match(/Chào bạn, Long Fish đây/g) || []).length;
      const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object: 'page', entry: [{ messaging: [{ sender: { id: psid }, message: { mid: randomUUID(), text: 'Xin chào' } }] }] }), signal: AbortSignal.timeout(20000) });
      assert.ok(response.ok);
      let resumed = false;
      for (let i = 0; i < 20; i++) {
        const replies = (docker(['logs', '--since=' + startedAt, 'backend']).match(/Chào bạn, Long Fish đây/g) || []).length;
        if (replies > previousReplies) { resumed = true; break; }
        await delay(500);
      }
      assert.ok(resumed, 'Chưa thấy bot trả lời lại sau khi đóng handoff.');
    });
  } finally {
    for (const code of created) {
      const result = await request('/admin/orders?q=' + code);
      const order = result.orders[0];
      if (order && ['PENDING', 'CONFIRMED'].includes(order.status)) await request('/admin/orders/' + order.id + '/status', { status: 'CANCELLED' }, 'PATCH');
    }
    await request('/admin/products/' + product.id, undefined, 'DELETE', 204);
  }
}
main().catch(error => { rows.push({ scenario: 'Khởi chạy kiểm thử', result: 'FAIL', note: (error as Error).message }); process.exitCode = 1; }).finally(async () => {
  await mkdir('docs', { recursive: true });
  const output = project?.includes('-pg') ? 'docs/e2e-postgres-results.json' : 'docs/e2e-results.json';
  await writeFile(output, JSON.stringify({ at: new Date().toISOString(), mode: 'Docker + n8n mock HTTP', rows }, null, 2) + '\n');
  for (const row of rows) console.log(row.result, row.scenario, row.note);
});
