// Kiểm tra SEO tự động theo hướng dẫn đồ án (Phần A4, B và C): đọc sitemap, mở từng trang bằng trình duyệt thật (Playwright)
// rồi kiểm tra title ≤60, mô tả 120–155, canonical, Open Graph, JSON-LD, H1 duy nhất, alt ảnh, breadcrumb, slug chuẩn,
// từ khóa chính trong H1/title/mô tả, trang riêng tư noindex. Chạy: npm run seo:audit   (BASE_URL mặc định http://localhost:8080)
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');

const base = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const fold = value => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const results = [];
const check = (page, rule, ok, detail = '') => results.push({ page, rule, ok: !!ok, detail });

(async () => {
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
  check('sitemap', 'Sitemap XML có trang chủ, danh mục, sản phẩm, trang nội dung', ['/', '/danh-muc/', '/san-pham/', '/gioi-thieu', '/lien-he', '/chinh-sach-doi-tra', '/chinh-sach-bao-mat', '/chinh-sach-van-chuyen'].every(part => urls.some(url => url === part || url.startsWith(part))), urls.length + ' địa chỉ');
  check('sitemap', 'Sitemap loại trừ giỏ hàng, thanh toán, tra cứu, quản trị', !urls.some(url => /^\/(checkout|confirmation|track|admin)/.test(url)));
  const robots = await (await fetch(base + '/robots.txt')).text();
  check('robots.txt', 'Chặn /admin, /api/, /checkout, /confirmation, /track và khai báo Sitemap', ['Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout', 'Disallow: /confirmation', 'Disallow: /track', 'Sitemap:'].every(line => robots.includes(line)));

  const old = await fetch(base + '/product/betta-halfmoon', { redirect: 'manual' });
  check('/product/…', 'Đường dẫn cũ chuyển hướng 301 sang /san-pham/', old.status === 301 && (old.headers.get('location') || '').endsWith('/san-pham/betta-halfmoon'), 'HTTP ' + old.status);
  for (const path of ['/checkout', '/confirmation', '/track', '/admin']) {
    const response = await fetch(base + path);
    check(path, 'Trang riêng tư có X-Robots-Tag noindex', /noindex/i.test(response.headers.get('x-robots-tag') || ''));
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const productFocus = {};
  for (const path of urls.filter(url => url !== '/credits')) {
    const page = await context.newPage();
    const response = await page.goto(base + path, { waitUntil: 'networkidle' });
    check(path, 'HTTP 200', response && response.status() === 200, 'HTTP ' + (response && response.status()));
    const data = await page.evaluate(() => {
      const meta = name => document.querySelector('meta[name="' + name + '"]')?.content || '';
      const prop = name => document.querySelector('meta[property="' + name + '"]')?.content || '';
      const lds = [...document.querySelectorAll('script[type="application/ld+json"]')].map(script => { try { return JSON.parse(script.textContent); } catch { return null; } });
      return {
        title: document.title, titles: document.querySelectorAll('title').length, description: meta('description'), canonical: document.querySelector('link[rel=canonical]')?.href || '',
        ogTitle: prop('og:title'), ogDescription: prop('og:description'), ogImage: prop('og:image'), twitter: meta('twitter:card'),
        h1: [...document.querySelectorAll('h1')].map(node => node.innerText.trim()), lds,
        firstParagraph: document.querySelector('main p')?.innerText || '', mainText: document.querySelector('main')?.innerText || '',
        imagesNoAlt: [...document.images].filter(image => !(image.getAttribute('alt') || '').trim()).length, images: document.images.length,
        breadcrumb: document.querySelector('.breadcrumb')?.innerText.replace(/\s*\n\s*/g, ' › ') || '', breadcrumbIsAfterHeader: !!document.querySelector('header + main .breadcrumb, header ~ main .breadcrumb'),
        sticky: getComputedStyle(document.querySelector('header')).position === 'sticky',
        header: ['.brand', '.menu nav', '.header-search', '.cart-link'].map(selector => !!document.querySelector('header ' + selector)),
        footerColumns: document.querySelectorAll('.footer-grid > *').length, copyright: /©/.test(document.querySelector('.footer-bottom')?.innerText || ''),
        words: (document.querySelector('main')?.innerText || '').trim().split(/\s+/).length,
      };
    });
    const kind = path === '/' ? 'home' : path.startsWith('/san-pham/') ? 'product' : path.startsWith('/danh-muc/') ? 'category' : 'page';
    check(path, 'Đúng 1 thẻ <title>, dài ≤ 60 ký tự', data.titles === 1 && data.title.length <= 60, data.title.length + ' ký tự: ' + data.title);
    check(path, 'Meta description 120–155 ký tự', data.description.length >= 120 && data.description.length <= 155, data.description.length + ' ký tự');
    check(path, 'Canonical đúng đường dẫn', data.canonical.endsWith(path === '/' ? '/' : path), data.canonical);
    check(path, 'Open Graph (title, description, image) + Twitter Card', data.ogTitle && data.ogDescription && data.ogImage && data.twitter);
    check(path, 'Tiêu đề dùng dấu phân cách | hoặc – (hoặc —)', /[|–—]/.test(data.title));
    check(path, 'Đúng 1 thẻ H1', data.h1.length === 1, data.h1.join(' / '));
    check(path, 'Mọi ảnh đều có alt', data.imagesNoAlt === 0, data.images + ' ảnh, thiếu alt: ' + data.imagesNoAlt);
    check(path, 'JSON-LD hợp lệ (parse được)', data.lds.length > 0 && data.lds.every(Boolean), data.lds.map(item => item && item['@type']).join(', '));
    check(path, 'Header: logo, menu, tìm kiếm, giỏ hàng; sticky', data.header.every(Boolean) && data.sticky);
    check(path, 'Footer 4 cột + copyright', data.footerColumns === 4 && data.copyright, data.footerColumns + ' cột');
    check(path, 'Slug chuẩn (không dấu, gạch ngang, không ?p=)', /^\/([a-z0-9]+(-[a-z0-9]+)*)?(\/[a-z0-9]+(-[a-z0-9]+)*)?$/.test(path));
    if (kind !== 'home') check(path, 'Breadcrumb ngay dưới header (Trang chủ › …)', data.breadcrumb.startsWith('Trang chủ') && data.breadcrumbIsAfterHeader, data.breadcrumb);
    const types = data.lds.filter(Boolean).map(item => item['@type']);
    if (kind === 'home') check(path, 'Schema Organization + WebSite', types.includes('Organization') && types.includes('WebSite'));
    if (kind === 'product') {
      check(path, 'Schema Product (offers VND) + BreadcrumbList', types.includes('Product') && types.includes('BreadcrumbList') && data.lds.find(item => item['@type'] === 'Product').offers.priceCurrency === 'VND');
      const name = data.h1[0] || '';
      const slugWords = fold(path.split('/').pop().replace(/-/g, ' '));
      const key = fold(name);
      check(path, 'Từ khóa chính (tên sản phẩm) có trong H1, title, mô tả, đoạn đầu', [data.h1[0], data.title, data.description, data.firstParagraph + ' ' + data.mainText.slice(0, 600)].every(text => fold(text).includes(key)), name);
      if (!key.includes(slugWords) && !slugWords.split(' ').every(word => key.includes(word))) productFocus[path] = name + ' ≠ slug ' + path.split('/').pop();
    }
    if (kind === 'category') {
      const description = data.mainText;
      check(path, 'Danh mục: H1 + mô tả 50–100 từ', data.h1.length === 1 && description.split(/\s+/).length >= 50);
      check(path, 'Schema BreadcrumbList + CollectionPage', types.includes('BreadcrumbList') && types.includes('CollectionPage'));
      check(path, 'Từ khóa chính (tên danh mục) có trong H1, title, mô tả', [data.h1[0], data.title, data.description].every(text => fold(text).includes(fold(data.h1[0]))));
    }
    if (kind === 'page') {
      const minimum = { '/gioi-thieu': 150, '/chinh-sach-doi-tra': 200, '/chinh-sach-bao-mat': 150, '/chinh-sach-van-chuyen': 150 }[path];
      if (minimum) check(path, 'Nội dung ≥ ' + minimum + ' từ', data.words >= minimum, data.words + ' từ');
    }
    await page.close();
  }
  await browser.close();

  const failed = results.filter(row => !row.ok);
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/seo-audit.json', JSON.stringify({ at: new Date().toISOString(), base, total: results.length, passed: results.length - failed.length, failed, slugNotes: productFocus }, null, 2));
  console.log('Đã kiểm tra ' + urls.length + ' trang, ' + results.length + ' mục: ' + (results.length - failed.length) + ' đạt, ' + failed.length + ' chưa đạt.');
  for (const row of failed.slice(0, 40)) console.log('  ✗ ' + row.page + ' — ' + row.rule + (row.detail ? ' [' + row.detail + ']' : ''));
  const notes = Object.entries(productFocus);
  if (notes.length) console.log('Lưu ý slug khác tên sản phẩm (' + notes.length + '): ' + notes.map(([, text]) => text).join('; '));
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error(error); process.exit(1); });
