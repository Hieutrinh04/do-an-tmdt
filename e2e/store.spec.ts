import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const phone = '0900000001';
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
async function capture(page: Page, info: TestInfo, name: string) {
  // Recharts animates in JavaScript, beyond screenshot's CSS animation control.
  if (process.env.E2E_SCREENSHOTS === '1' && name === 'dashboard') await page.waitForTimeout(1800);
  if (process.env.E2E_SCREENSHOTS === '1') await page.screenshot({
    path: `docs/screenshots/${name}-${info.project.name}.jpg`, fullPage: true, scale: 'css', animations: 'disabled',
  });
}
async function login(page: Page) {
  const project = process.env.E2E_COMPOSE_PROJECT;
  if (!project || project === 'long-fish') throw new Error('Use an isolated E2E_COMPOSE_PROJECT for write tests.');
  const credential = (script: string) => execFileSync('docker', ['compose', '-p', project, 'exec', '-T', 'backend', 'node', '-e', script], { encoding: 'utf8' }).trim();
  await page.goto('/admin');
  await page.getByLabel('Tên đăng nhập').fill(credential("process.stdout.write(process.env.ADMIN_USERNAME || 'admin')"));
  await page.getByLabel('Mật khẩu').fill(credential("process.stdout.write(process.env.ADMIN_PASSWORD || require('node:fs').readFileSync('/data/admin-password','utf8'))"));
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan doanh thu' })).toBeVisible();
}

test('catalog, filters, Vietnamese search, loaded photos and attribution', async ({ page }, info) => {
  await page.goto('/');
  const cards = page.locator('.product-card');
  await expect(cards).toHaveCount(27);
  await expect(cards.getByText('Còn hàng', { exact: true }).first()).toBeVisible();
  for (const picture of await cards.locator('img').all()) {
    await picture.scrollIntoViewIfNeeded();
    await expect.poll(() => picture.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, info, 'home');
  await page.getByRole('button', { name: 'Betta', exact: true }).click();
  await expect(cards).toHaveCount(3);
  await page.getByLabel('Khoảng giá').selectOption('0-99999');
  await page.getByLabel('Độ khó nuôi').selectOption('Nâng cao');
  await expect(cards).toHaveCount(0);
  await page.getByLabel('Độ khó nuôi').selectOption('Dễ');
  await expect(cards).toHaveCount(3);
  await page.getByLabel('Khoảng giá').selectOption('100000-299999');
  await expect(cards).toHaveCount(0);
  await page.getByLabel('Khoảng giá').selectOption('');
  await page.getByLabel('Độ khó nuôi').selectOption('');
  await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
  for (const search of ['Cá thần tiên', 'ca than tien']) {
    await page.getByRole('textbox', { name: 'Tìm sản phẩm' }).fill(search);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Cá thần tiên');
  }
  await page.getByRole('link', { name: 'Nguồn ảnh', exact: true }).click();
  const credits = await (await page.request.get('/catalog/photos/credits.json')).json();
  await expect(page.locator('.credits-grid article')).toHaveCount(Object.values(credits).flat().length);
  await capture(page, info, 'credits');
});

test('fish detail, minimum quantity, care and SVG label', async ({ page }, info) => {
  await page.goto('/san-pham/neon-tetra');
  await expect(page.getByRole('heading', { name: 'Neon Tetra' })).toBeVisible();
  await page.getByRole('button', { name: 'Xanh ánh kim', exact: true }).click();
  await expect(page.getByRole('button', { name: /Mua ngay/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Xanh đỏ', exact: true }).click();
  for (const label of ['Cỡ', 'Giới tính']) {
    const group = page.getByRole('group', { name: label, exact: true });
    await group.getByRole('button').first().click();
    await expect(group.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  }
  const quantity = page.getByRole('spinbutton', { name: 'Số lượng' });
  await quantity.fill('1');
  await expect(quantity).toHaveValue('6');
  await expect(page.getByRole('heading', { name: 'Thông số nuôi tham khảo' })).toBeVisible();
  await expect(page.getByText('Cam kết cá sống khi nhận')).toBeVisible();
  await expect(page.locator('.photo-credit')).toContainText('Ảnh:');
  await capture(page, info, 'product');
  await page.goto('/san-pham/betta-plakat-koi');
  await expect(page.getByText('Ảnh minh họa')).toBeVisible();
  for (const slug of ['betta-halfmoon', 'ca-dia']) {
    await page.goto('/san-pham/' + slug);
    await expect(page.locator('.detail')).toBeVisible();
    await expect.poll(() => page.locator('.detail .product-art img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await capture(page, info, 'product-' + slug);
  }
});

async function checkout(page: Page, payment: 'COD' | 'BANK_QR', info: TestInfo) {
  await page.goto('/san-pham/betta-halfmoon');
  await page.getByRole('button', { name: /Mua ngay/ }).click();
  await page.getByLabel('Họ và tên').fill('Khách thử Playwright');
  await page.getByLabel('Số điện thoại').fill(phone);
  await page.getByLabel('Email', { exact: true }).fill('playwright@example.com');
  await page.getByLabel('Quận / huyện').fill('Quận thử');
  await page.getByLabel('Phường / xã').fill('Phường thử');
  await page.getByLabel('Địa chỉ cụ thể').fill('Địa chỉ thử');
  await page.getByLabel(/Ghi chú đơn hàng/).fill('TEST playwright');
  const submit = page.getByRole('button', { name: 'Đặt hàng →' });
  const doa = page.getByLabel('Tôi đã đọc chính sách cá sống');
  await page.getByLabel('Tỉnh / thành').fill('An Giang');
  await doa.check();
  const policy = await (await page.request.get('/api/shipping/policy')).json() as { liveEverywhere?: boolean };
  if (!policy.liveEverywhere) {
    await expect(page.getByRole('alert')).toContainText('chưa giao cá sống');
    await expect(submit).toBeDisabled();
  }
  const quote = page.waitForResponse(response => response.url().endsWith('/api/shipping/quote') && response.request().postData()?.includes('Hồ Chí Minh') === true);
  await page.getByLabel('Tỉnh / thành').fill('Hồ Chí Minh');
  const { subtotal, discount, shippingFee, packingFee, total } = await (await quote).json();
  expect(total).toBe(subtotal - discount + shippingFee + packingFee);
  for (const value of [subtotal, shippingFee, packingFee, total]) await expect(page.locator('.totals')).toContainText(money(value));
  await expect(submit).toBeEnabled();
  await doa.uncheck();
  await expect(submit).toBeDisabled();
  await doa.check();
  if (payment === 'BANK_QR') await page.getByLabel('Chuyển khoản VietQR').check();
  if (payment === 'COD') await capture(page, info, 'checkout');
  const order = page.waitForResponse(response => response.url().endsWith('/api/orders') && response.request().method() === 'POST');
  await submit.click();
  expect((await order).status()).toBe(201);
  const { code } = await (await order).json();
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn!' })).toBeVisible();
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
  if (payment === 'BANK_QR') {
    const qr = page.getByRole('img', { name: /VietQR/ });
    const url = new URL((await qr.getAttribute('src'))!);
    expect(url.searchParams.get('amount')).toBe(String(total));
    expect(url.searchParams.get('addInfo')).toBe(code);
    await expect.poll(() => qr.evaluate(img => (img as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    await capture(page, info, 'vietqr');
  }
  return code as string;
}

test('checkout COD/VietQR, admin fulfillment, cancellation and tracking', async ({ page }, info) => {
  test.skip(process.env.E2E_WRITE !== '1' || !process.env.E2E_COMPOSE_PROJECT?.startsWith('long-fish-e2e'), 'Write tests need an isolated mock stack.');
  test.setTimeout(120_000);
  const cod = await checkout(page, 'COD', info);
  const qr = await checkout(page, 'BANK_QR', info);
  const stock = async () => (await (await page.request.get('/api/products/betta-halfmoon')).json()).variants.reduce((sum: number, variant: { stock: number }) => sum + variant.stock, 0);
  const before = await stock();
  await login(page);
  const stats = page.waitForResponse(response => response.url().includes('/api/admin/stats/overview'));
  await page.reload();
  const metrics = await (await stats).json();
  await expect(page.getByText(money(metrics.todayRevenue), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(money(metrics.monthRevenue), { exact: true }).first()).toBeVisible();
  await capture(page, info, 'dashboard');
  await page.getByRole('link', { name: 'Đơn hàng', exact: true }).click();
  await page.getByRole('button', { name: cod, exact: true }).click();
  await capture(page, info, 'admin');
  for (const name of ['Đã xác nhận', 'Đang giao', 'Đã giao']) await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đóng', exact: true })).toBeEnabled();
  await expect(page.getByText(/· Đã giao$/)).toBeVisible();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: qr, exact: true }).click();
  await expect(page.getByRole('heading', { name: qr, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đã hủy', exact: true }).click();
  await expect.poll(stock).toBe(before + 1);
  await page.goto('/track?code=' + cod);
  const field = page.getByLabel('Số điện thoại đặt hàng');
  await field.fill('0900000002');
  await page.getByRole('button', { name: /Tra cứu/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await field.fill(phone);
  await page.getByRole('button', { name: /Tra cứu/ }).click();
  for (const name of ['Chờ xác nhận', 'Đã xác nhận', 'Đang giao', 'Đã giao']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await capture(page, info, 'track');
});

test('admin drags in two photos, reorders, selects cover and removes', async ({ page }, info) => {
  test.skip(process.env.E2E_WRITE !== '1' || !process.env.E2E_COMPOSE_PROJECT?.startsWith('long-fish-e2e'), 'Write tests need an isolated mock stack.');
  await login(page);
  await page.goto('/admin/products');
  const slug = 'demo-playwright-' + info.project.name + '-' + Date.now();
  const form = page.locator('details').filter({ has: page.getByText('Thêm sản phẩm', { exact: true }) }).first();
  await form.locator('summary').click();
  await form.getByLabel('Tên sản phẩm').fill('TEST ảnh ' + info.project.name);
  await form.getByLabel('Đường dẫn (slug)').fill(slug);
  await form.getByLabel('Danh mục').fill('Kiểm thử');
  await form.getByLabel('Giá (₫)').fill('1000');
  await form.getByLabel('Mô tả').fill('TEST Playwright');
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#507a82' } }).png().toBuffer();
  const data = await page.evaluateHandle(base64 => {
    const transfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    for (const name of ['test-a.png', 'test-b.png']) transfer.items.add(new File([bytes], name, { type: 'image/png' }));
    return transfer;
  }, png.toString('base64'));
  await form.locator('.upload-drop').dispatchEvent('drop', { dataTransfer: data });
  const rows = form.locator('.image-order');
  await expect(rows).toHaveCount(2, { timeout: 25_000 });
  const source = form.getByLabel(/Địa chỉ ảnh/);
  const [a, b] = (await source.inputValue()).split('\n');
  await rows.nth(1).getByRole('button', { name: 'Đặt làm ảnh chính' }).click();
  await expect(source).toHaveValue(`${b}\n${a}`);
  await rows.first().getByRole('button', { name: 'Xuống' }).click();
  await expect(source).toHaveValue(`${a}\n${b}`);
  await rows.last().getByRole('button', { name: 'Xóa khỏi sản phẩm' }).click();
  await expect(source).toHaveValue(a);
  await capture(page, info, 'upload');
  await form.getByRole('button', { name: 'Thêm sản phẩm' }).click();
  await expect(page.getByText('Đã lưu thay đổi.')).toBeVisible();
  const product = await (await page.request.get('/api/products/' + slug)).json();
  expect(product.images).toEqual([a]);
  await page.goto('/credits');
  await expect(page.locator('article').filter({ hasText: 'TEST ảnh ' + info.project.name })).toContainText('Ảnh do Long Fish cung cấp');
  await page.goto('/admin/products');
  const saved = page.locator('details.admin-list').filter({ has: page.locator('summary').filter({ hasText: 'TEST ảnh ' + info.project.name }) }).first();
  await saved.locator('summary').first().click();
  await saved.getByRole('button', { name: 'Ẩn', exact: true }).click();
  await expect(saved.locator('summary').first()).toContainText('Đã ẩn');
});

test('giá khuyến mãi, thêm vào giỏ, mini cart, giỏ hàng với mã giảm giá và phí giao theo tỉnh (chỉ đọc, không đặt đơn)', async ({ page }) => {
  await page.goto('/san-pham/betta-halfmoon');
  await expect(page.locator('.price del')).toContainText('69.000');
  await expect(page.locator('.price strong')).toContainText('59.000');
  await expect(page.getByRole('heading', { name: 'Mua kèm cho bể của bạn' })).toBeVisible();
  await expect(page.locator('.shipping-note')).toContainText('Miễn phí vận chuyển');
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByText(/Đã thêm Betta Halfmoon vào giỏ hàng/)).toBeVisible();
  await expect(page.locator('.cart-badge')).toHaveText('1');
  // Mini cart: rê chuột vào biểu tượng giỏ hàng
  await page.locator('.mini-cart').hover();
  const mini = page.getByRole('dialog', { name: 'Giỏ hàng thu nhỏ' });
  await expect(mini).toContainText('Betta Halfmoon');
  await expect(mini).toContainText('59.000');
  await expect(mini.getByRole('link', { name: 'Xem giỏ hàng' })).toBeVisible();
  await expect(mini.getByRole('link', { name: 'Thanh toán' })).toBeVisible();
  await mini.getByRole('link', { name: 'Xem giỏ hàng' }).click();
  await expect(page).toHaveURL(/\/gio-hang$/);
  await page.getByLabel('Tỉnh / thành (ước tính phí giao)').fill('Hà Nội');
  await page.getByLabel('Mã giảm giá').fill('khongco');
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'không tồn tại' })).toBeVisible();
  await page.getByLabel('Mã giảm giá').fill('welcome10');
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByText(/Đã áp dụng mã WELCOME10/)).toBeVisible();
  const totals = page.locator('.cart-summary .totals');
  await expect(totals).toContainText('-5.900');
  await expect(totals).toContainText('30.000');
  await expect(page.getByRole('link', { name: 'Tiếp tục mua sắm' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tiến hành thanh toán/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Xóa Betta Halfmoon khỏi giỏ' }).click();
  await expect(page.getByText('Giỏ hàng của bạn đang trống.')).toBeVisible();
});

test('trang tài khoản có form Đăng nhập và Đăng ký, link Quên mật khẩu; trang chính sách, giới thiệu, liên hệ hiển thị', async ({ page }) => {
  await page.goto('/tai-khoan');
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đăng ký' })).toBeVisible();
  await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
  await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible();
  for (const [path, heading] of [['/gioi-thieu', 'Giới thiệu Long Fish'], ['/lien-he', 'Liên hệ Long Fish'], ['/chinh-sach-doi-tra', 'Chính sách đổi trả & hoàn tiền'],
    ['/chinh-sach-bao-mat', 'Chính sách bảo mật'], ['/chinh-sach-van-chuyen', 'Chính sách vận chuyển']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  await expect(page.getByRole('table')).toBeVisible();
});
