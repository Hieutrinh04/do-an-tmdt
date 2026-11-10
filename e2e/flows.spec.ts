import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Kịch bản bổ sung (bước 5, việc 5). Chỉ chạy trên stack kiểm thử cách ly có E2E_WRITE=1.
// Mọi dữ liệu tạo ra có tiền tố "TEST" và số điện thoại 0900000xxx để dễ dọn.

const writeMode = process.env.E2E_WRITE === '1' && process.env.E2E_COMPOSE_PROJECT?.startsWith('long-fish-e2e');
test.skip(!writeMode, 'Write tests need an isolated mock stack.');
test.setTimeout(120_000);

const run = Date.now().toString(36);
// Sản phẩm TEST được ẩn sau mỗi kịch bản để không làm lệch số lượng sản phẩm của store.spec.ts.
const createdProductIds: string[] = [];
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

function adminCredentials(): { username: string; password: string } {
  const project = process.env.E2E_COMPOSE_PROJECT!;
  const exec = (script: string) => execFileSync('docker', ['compose', '-p', project, 'exec', '-T', 'backend', 'node', '-e', script], { encoding: 'utf8' }).trim();
  return {
    username: exec("process.stdout.write(process.env.ADMIN_USERNAME || 'admin')"),
    password: exec("process.stdout.write(process.env.ADMIN_PASSWORD || require('node:fs').readFileSync('/data/admin-password','utf8'))"),
  };
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/admin/login', { data: adminCredentials() });
  expect(response.status()).toBe(200);
  return (await response.json()).token as string;
}

async function createProduct(request: APIRequestContext, token: string, label: string, stock: number, live: boolean) {
  const slug = `test-${label}-${run}`;
  const created = await request.post('/api/admin/products', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `TEST ${label} ${run}`, slug, description: 'TEST Playwright luồng bổ sung.', price: 50000,
      category: 'Kiểm thử', images: ['/catalog/betta.svg'], isLiveFish: live },
  });
  expect(created.status()).toBe(201);
  const product = await created.json();
  createdProductIds.push(product.id);
  const variant = await request.post(`/api/admin/products/${product.id}/variants`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { sku: `${slug}-v`, color: 'Đỏ', size: '3–4 cm', gender: 'Đực', unit: 'con', stock, minQty: 1 },
  });
  expect(variant.status()).toBe(201);
  return { slug, product, variant: await variant.json() };
}

test.afterEach(async ({ request }) => {
  const token = await adminToken(request);
  for (const id of createdProductIds.splice(0)) {
    const response = await request.delete(`/api/admin/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(204);
  }
});

async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'trang không được cuộn ngang').toBeLessThanOrEqual(1);
}

test('giao diện không tràn ngang trên các trang chính (desktop và điện thoại)', async ({ page }) => {
  for (const path of ['/', '/san-pham/neon-tetra', '/checkout', '/track', '/credits']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalScroll(page);
  }
});

test('tra cứu đơn tự cập nhật trạng thái sau khi admin đổi trạng thái', async ({ page, request }) => {
  const token = await adminToken(request);
  const { variant } = await createProduct(request, token, 'poll', 10, false);
  const phone = '0900000011';
  const created = await request.post('/api/orders', {
    data: { customerName: 'Khách polling', phone, province: 'Hồ Chí Minh', district: 'Quận thử', address: 'TEST polling',
      paymentMethod: 'COD', doaAccepted: false, note: 'TEST ' + run, items: [{ variantId: variant.id, quantity: 1 }] },
  });
  expect(created.status()).toBe(201);
  const { code } = await created.json();

  await page.goto('/track?code=' + code);
  await page.getByLabel('Số điện thoại đặt hàng').fill(phone);
  await page.getByRole('button', { name: /Tra cứu/ }).click();
  await expect(page.locator('.tracking .badge')).toHaveText('Chờ xác nhận');

  const found = await (await request.get('/api/admin/orders?q=' + code, { headers: { Authorization: `Bearer ${token}` } })).json();
  const order = found.orders.find((row: { code: string }) => row.code === code);
  const changed = await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { Authorization: `Bearer ${token}` }, data: { status: 'CONFIRMED' },
  });
  expect(changed.status()).toBe(200);
  // Trang tự gọi lại API mỗi 15 giây, nên chờ tối đa 25 giây.
  await expect(page.locator('.tracking .badge')).toHaveText('Đã xác nhận', { timeout: 25_000 });
});

test('sản phẩm hết hàng hiển thị trạng thái và không cho đặt', async ({ page, request }) => {
  const token = await adminToken(request);
  const { slug } = await createProduct(request, token, 'hethang', 0, false);

  await page.goto('/?search=' + encodeURIComponent('TEST hethang ' + run));
  const card = page.locator('.product-card').filter({ hasText: 'TEST hethang ' + run });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Hết hàng');

  const denied = await request.post('/api/orders', {
    data: { customerName: 'Khách hết hàng', phone: '0900000012', province: 'Hồ Chí Minh', district: 'Quận thử', address: 'TEST hết hàng',
      paymentMethod: 'COD', doaAccepted: false, note: 'TEST ' + run, items: [{ variantId: (await (await request.get('/api/products/' + slug)).json()).variants[0].id, quantity: 1 }] },
  });
  expect(denied.status()).toBe(409);
});

test('hết hàng hiển thị mẫu cùng nhóm còn hàng', async ({ page, request }) => {
  const token = await adminToken(request);
  const soldOut = await createProduct(request, token, 'hetnhom', 0, false);
  const available = await createProduct(request, token, 'conhang', 5, false);
  await page.goto('/san-pham/' + soldOut.slug);
  const panel = page.getByLabel('Mẫu cùng nhóm còn hàng');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: new RegExp('TEST conhang ' + run) })).toHaveAttribute('href', '/san-pham/' + available.slug);
  await panel.getByRole('link', { name: new RegExp('TEST conhang ' + run) }).click();
  await expect(page).toHaveURL(new RegExp(available.slug));
  await expect(page.getByRole('heading', { name: 'TEST conhang ' + run })).toBeVisible();
});

test('khách nhập email khi đặt hàng thì n8n gửi email xác nhận (mock)', async ({ page, request }) => {
  const token = await adminToken(request);
  const { slug } = await createProduct(request, token, 'email', 5, false);
  await page.goto('/san-pham/' + slug);
  await page.getByRole('button', { name: /Mua ngay/ }).click();
  await page.getByLabel('Họ và tên').fill('Khách email Playwright');
  await page.getByLabel('Số điện thoại').fill('0900000015');
  const email = page.getByLabel('Email (không bắt buộc)');
  await expect(email).toHaveAttribute('type', 'email');
  const address = 'e2e-' + run + '@example.com';
  await email.fill(address);
  await page.getByLabel('Tỉnh / thành').fill('Hồ Chí Minh');
  await page.getByLabel('Quận / huyện').fill('Quận thử');
  await page.getByLabel('Địa chỉ cụ thể').fill('TEST email');
  const order = page.waitForResponse(response => response.url().endsWith('/api/orders') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Đặt hàng →' }).click();
  expect((await order).status()).toBe(201);
  const { code } = await (await order).json();
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn!' })).toBeVisible();
  // Outbox gửi sự kiện sang n8n; n8n gọi endpoint mock và backend ghi log người nhận đã che bớt.
  const masked = address.slice(0, 2) + '***@example.com';
  const logs = () => execFileSync('docker', ['compose', '-p', process.env.E2E_COMPOSE_PROJECT!, 'logs', 'backend', '--since', '5m'], { encoding: 'utf8' });
  await expect.poll(() => logs().split(/\r?\n/).some(line => line.includes('→ ' + masked) && line.includes('Xác nhận đơn ' + code)),
    { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }).toBe(true);
});

test('phụ kiện luôn được giao; cá sống bị chặn ngoài vùng, hoặc được giao khi bật giao toàn quốc', async ({ request }) => {
  const token = await adminToken(request);
  const accessory = await createProduct(request, token, 'phukien', 5, false);
  const fish = await createProduct(request, token, 'ca', 5, true);
  const base = {
    customerName: 'Khách ngoài vùng', phone: '0900000013', province: 'An Giang', district: 'Quận thử', address: 'TEST ngoài vùng',
    paymentMethod: 'COD', note: 'TEST ' + run,
  };
  const accessoryOrder = await request.post('/api/orders', { data: { ...base, doaAccepted: false, items: [{ variantId: accessory.variant.id, quantity: 1 }] } });
  expect(accessoryOrder.status()).toBe(201);
  const fishOrder = await request.post('/api/orders', { data: { ...base, doaAccepted: true, items: [{ variantId: fish.variant.id, quantity: 1 }] } });
  const policy = await (await request.get('/api/shipping/policy')).json() as { liveEverywhere?: boolean };
  expect(fishOrder.status()).toBe(policy.liveEverywhere ? 201 : 422);
});

test('đăng nhập admin sai nhiều lần bị khóa tạm', async ({ request }, info) => {
  // Khóa theo IP + tên đăng nhập: dùng tên giả riêng để không khóa tài khoản admin thật
  // của các kịch bản khác. Chỉ chạy một lần (desktop) vì giới hạn theo IP dùng chung.
  test.skip(info.project.name !== 'desktop', 'Chỉ chạy một lần để không làm đầy giới hạn IP.');
  const username = 'lockout-' + run;
  let last = 0;
  for (let attempt = 1; attempt <= 11; attempt++) {
    const response = await request.post('/api/admin/login', { data: { username, password: 'sai-mat-khau-' + attempt } });
    last = response.status();
    if (attempt <= 10) expect(response.status()).toBe(401);
  }
  expect(last).toBe(429);
});

test('phiếu A6 chỉ hiện khi in', async ({ page, request }) => {
  const token = await adminToken(request);
  const { variant } = await createProduct(request, token, 'in', 10, false);
  const created = await request.post('/api/orders', {
    data: { customerName: 'Khách in phiếu', phone: '0900000014', province: 'Hồ Chí Minh', district: 'Quận thử', address: 'TEST in phiếu',
      paymentMethod: 'COD', doaAccepted: false, note: 'TEST ' + run, items: [{ variantId: variant.id, quantity: 1 }] },
  });
  const { code } = await created.json();

  const { username, password } = adminCredentials();
  await page.goto('/admin');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan doanh thu' })).toBeVisible();
  await page.getByRole('link', { name: 'Đơn hàng', exact: true }).click();
  await page.getByLabel('Mã đơn / điện thoại').fill(code);
  await page.getByLabel('Mã đơn / điện thoại').press('Enter');
  await page.getByRole('button', { name: code, exact: true }).click();

  const label = page.locator('article.packing-label');
  await page.emulateMedia({ media: 'screen' });
  await expect(label).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(label).toBeVisible();
  await expect(label).toContainText(code);
  await page.emulateMedia({ media: 'screen' });
});
