// Chụp toàn trang cửa hàng ở cỡ máy tính và điện thoại để rà lỗi giao diện (chỉ đọc, không đặt đơn).
// Chạy: node scripts/ui-shots.cjs [thư-mục-lưu]   (mặc định data/ui-shots)
const { chromium, devices } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const base = process.env.CHECK_BASE_URL || 'http://127.0.0.1:8080';
const out = path.resolve(process.argv[2] || 'data/ui-shots');
const pages = [
  ['home', '/'], ['category', '/danh-muc/betta'], ['product', '/san-pham/betta-halfmoon'], ['product-gear', '/san-pham/loc-thac'],
  ['cart', '/gio-hang'], ['checkout', '/checkout'], ['account', '/tai-khoan'], ['about', '/gioi-thieu'], ['contact', '/lien-he'],
  ['policy', '/chinh-sach-doi-tra'], ['track', '/track'], ['search', '/?q=betta'], ['notfound', '/khong-co-trang-nay'],
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const [device, options] of [['desktop', { viewport: { width: 1366, height: 900 } }], ['mobile', devices['iPhone 13']]]) {
    const context = await browser.newContext({ ...options, locale: 'vi-VN' });
    const page = await context.newPage();
    const problems = [];
    page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
    page.on('pageerror', error => problems.push(error.message));
    // Cho một sản phẩm vào giỏ để chụp giỏ hàng / thanh toán có dữ liệu.
    await page.goto(base + '/san-pham/betta-halfmoon', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Thêm vào giỏ' }).click().catch(() => problems.push('Không bấm được Thêm vào giỏ'));
    for (const [name, url] of pages) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return [...document.querySelectorAll('body *')].filter(node => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.right > width + 1 && getComputedStyle(node).position !== 'fixed';
        }).slice(0, 5).map(node => node.tagName.toLowerCase() + '.' + String(node.className).split(' ').slice(0, 2).join('.') + ' r=' + Math.round(node.getBoundingClientRect().right));
      });
      if (overflow.length) problems.push(name + ' tràn ngang: ' + overflow.join(', '));
      await page.screenshot({ path: path.join(out, device + '-' + name + '.png'), fullPage: true });
    }
    console.log(device, problems.length ? '\n  ' + [...new Set(problems)].join('\n  ') : 'không lỗi console/tràn ngang');
    await context.close();
  }
  await browser.close();
  console.log('Đã lưu ảnh vào', out);
})();
