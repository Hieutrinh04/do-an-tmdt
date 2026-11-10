import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import supertest from 'supertest';

const name = 'seo-test-' + randomUUID() + '.db';
process.env.DATABASE_URL = 'file:./' + name;
process.env.MOCK_INTEGRATIONS = 'true';
process.env.SITE_URL = 'https://long-fish.example';
process.env.SHOP_NAME = 'Long Fish';
process.env.SHOP_FACEBOOK_URL = 'https://www.facebook.com/long-fish-test';
process.env.SHOP_ADDRESS = '12 Nguyễn Huệ, Quận 1, TP.HCM';
process.env.SHOP_PHONE = '0900 000 000';
process.env.SHOP_EMAIL = 'shop@long-fish.example';
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.SHIPPING_FEES_JSON = '{"Hồ Chí Minh":20000,"Hà Nội":30000}';
process.env.SHIPPING_DEFAULT_FEE = '35000';
process.env.SHIPPING_FREE_THRESHOLD = '600000';
process.env.LIVE_FISH_PACKING_FEE = '30000';
process.env.LIVE_FISH_PROVINCES_JSON = '["*"]';

const shell = '<!doctype html><html lang="vi"><head><meta charset="UTF-8" /><meta name="description" content="mặc định" /><title>Mặc định</title></head><body><div id="root"></div></body></html>';
let db: typeof import('../src/db').db;
let api: ReturnType<typeof supertest>;
let seoLib: typeof import('../src/seo');

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(shell, { status: 200 })));
  db = (await import('../src/db')).db;
  seoLib = await import('../src/seo');
  const sql = readdirSync('prisma/migrations').filter(dir => /^\d/.test(dir)).sort()
    .map(dir => readFileSync('prisma/migrations/' + dir + '/migration.sql', 'utf8')).join('\n');
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  await db.product.create({ data: {
    name: 'Betta "Halfmoon" <b>', slug: 'betta-halfmoon', description: 'Cá Betta đẹp, nuôi riêng. '.repeat(20), price: 69000,
    images: ['/catalog/photos/betta-halfmoon-1.webp'], category: 'Betta',
    variants: { create: [
      { color: 'Đỏ', size: '3–4 cm', sku: 'SEO-1', stock: 10 },
      { color: 'Xanh', size: '3–4 cm', sku: 'SEO-2', stock: 5, priceOverride: 89000 },
    ] },
  } });
  await db.product.create({ data: { name: 'Đã ẩn', slug: 'da-an', description: 'x', price: 1000, images: ['/x.svg'], category: 'Betta', isActive: false,
    variants: { create: { color: 'a', size: 'b', sku: 'SEO-HIDDEN', stock: 5 } } } });
  await db.product.create({ data: { name: 'Hết hàng', slug: 'het-hang', description: 'Sản phẩm hết', price: 10000, images: ['https://cdn.example/a.webp'], category: 'Thiết bị',
    variants: { create: { color: 'a', size: 'b', sku: 'SEO-OUT', stock: 0 } } } });
  api = supertest((await import('../src/app')).createApp());
}, 30000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$disconnect();
  for (const suffix of ['', '-journal']) { try { unlinkSync(resolve('prisma', name + suffix)); } catch { /* không có file */ } }
});

const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const meta = (html: string) => ({
  title: html.match(/<title>([\s\S]*?)<\/title>/)![1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
  description: html.match(/<meta name="description" content="([^"]*)"/)![1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
});

test('trang sản phẩm: title ≤60, mô tả 120–155, canonical /san-pham/, Open Graph, Product + Breadcrumb có danh mục; thoát ký tự đặc biệt', async () => {
  const html = (await api.get('/seo/san-pham/betta-halfmoon').expect(200).expect('Content-Type', /text\/html/)).text;
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html).not.toContain('Mặc định');
  expect(html).not.toContain('<b>');
  expect(html).toContain('<div id="root"></div>');
  const { title, description } = meta(html);
  expect(title).toBe('Betta "Halfmoon" <b> — Long Fish | Giá Tốt');
  expect(title.length).toBeLessThanOrEqual(60);
  expect(description.length).toBeGreaterThanOrEqual(120);
  expect(description.length).toBeLessThanOrEqual(155);
  expect(description).toContain('giá từ 69.000');
  expect(html).toContain('<link rel="canonical" href="https://long-fish.example/san-pham/betta-halfmoon" />');
  expect(html).toContain('<meta property="og:image" content="https://long-fish.example/catalog/photos/betta-halfmoon-1.webp" />');
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  const [product, crumbs] = ld(html);
  expect(product).toMatchObject({ '@type': 'Product', brand: { name: 'Long Fish' } });
  expect(product.offers).toMatchObject({ '@type': 'AggregateOffer', priceCurrency: 'VND', lowPrice: 69000, highPrice: 89000, offerCount: 2, availability: 'https://schema.org/InStock' });
  expect(crumbs['@type']).toBe('BreadcrumbList');
  expect(crumbs.itemListElement.map((item: { name: string }) => item.name)).toEqual(['Trang chủ', 'Betta', 'Betta "Halfmoon" <b>']);
  expect(crumbs.itemListElement[1].item).toBe('https://long-fish.example/danh-muc/betta');
});

test('sản phẩm hết hàng báo OutOfStock; ảnh https giữ nguyên; JSON-LD không thoát được khỏi thẻ script', async () => {
  const html = (await api.get('/seo/san-pham/het-hang').expect(200)).text;
  expect(ld(html)[0].offers.availability).toBe('https://schema.org/OutOfStock');
  expect(html).toContain('<meta property="og:image" content="https://cdn.example/a.webp" />');
  await db.product.update({ where: { slug: 'het-hang' }, data: { description: '</script><script>alert(1)</script>' } });
  const evil = (await api.get('/seo/san-pham/het-hang').expect(200)).text;
  expect(evil).not.toContain('</script><script>alert');
  expect(ld(evil)[0].description).toContain('</script>');
});

test('sản phẩm ẩn hoặc không tồn tại trả 404 để nginx quay về giao diện tĩnh', async () => {
  await api.get('/seo/san-pham/da-an').expect(404);
  await api.get('/seo/san-pham/khong-co').expect(404);
});

test('trang chủ: tiêu đề ≤60 dùng dấu –, mô tả 120–155, Organization có sameAs và liên hệ, ảnh OG 1200×630', async () => {
  const html = (await api.get('/seo/home').expect(200)).text;
  const { title, description } = meta(html);
  expect(title).toBe('Long Fish – Cá Cảnh Nước Ngọt & Thủy Sinh');
  expect(title.length).toBeLessThanOrEqual(60);
  expect(description.length).toBeGreaterThanOrEqual(120);
  expect(description.length).toBeLessThanOrEqual(155);
  const [organization, site] = ld(html);
  expect(organization).toMatchObject({ '@type': 'Organization', sameAs: ['https://www.facebook.com/long-fish-test'], contactPoint: { telephone: '0900 000 000', email: 'shop@long-fish.example' } });
  expect(site['@type']).toBe('WebSite');
  expect(html).toContain('<meta property="og:image" content="https://long-fish.example/og-default.jpg" />');
  expect(html).toContain('<meta property="og:image:width" content="1200" />');
  expect(html).toContain('<meta property="og:image:height" content="630" />');
  expect(html).toContain('<link rel="canonical" href="https://long-fish.example/" />');
});

test('trang danh mục: có H1 từ mô tả, title theo mẫu "Tên — Shop | Hàng Mới năm", mô tả 120–155, CollectionPage + Breadcrumb', async () => {
  const html = (await api.get('/seo/danh-muc/betta').expect(200)).text;
  const { title, description } = meta(html);
  expect(title).toBe('Betta — Long Fish | Hàng Mới ' + new Date().getFullYear());
  expect(description.length).toBeGreaterThanOrEqual(120);
  expect(description.length).toBeLessThanOrEqual(155);
  expect(html).toContain('<link rel="canonical" href="https://long-fish.example/danh-muc/betta" />');
  const [crumbs, collection] = ld(html);
  expect(crumbs.itemListElement.map((item: { name: string }) => item.name)).toEqual(['Trang chủ', 'Betta']);
  expect(collection['@type']).toBe('CollectionPage');
  expect(collection.mainEntity.numberOfItems).toBe(1);
  await api.get('/seo/danh-muc/khong-co').expect(404);
  await api.get('/seo/danh-muc/guppy').expect(404);
});

test('mô tả mỗi danh mục 50–100 từ, slug không dấu ngăn cách bằng gạch ngang, tên khớp dữ liệu sản phẩm', async () => {
  const { categories, wordCount } = await import('../src/site-content');
  expect(categories.length).toBeGreaterThanOrEqual(4);
  for (const item of categories) {
    expect(item.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const words = wordCount(item.description);
    expect(words, item.name).toBeGreaterThanOrEqual(50);
    expect(words, item.name).toBeLessThanOrEqual(100);
  }
  const catalog = await import('../prisma/aquatic-catalog');
  const names = new Set([...catalog.fish, ...catalog.supplies].map((row: readonly unknown[]) => row[2] as string));
  for (const name of names) expect(categories.map(item => item.name), name).toContain(name);
});

test('trang giới thiệu/chính sách đạt số từ tối thiểu; trang vận chuyển có bảng phí; mỗi trang có title ≤60 và mô tả 120–155', async () => {
  const { sitePages, pageWords } = await import('../src/site-content');
  const words = Object.fromEntries(sitePages().map(page => [page.slug, pageWords(page)]));
  expect(words['gioi-thieu']).toBeGreaterThanOrEqual(150);
  expect(words['chinh-sach-doi-tra']).toBeGreaterThanOrEqual(200);
  expect(words['chinh-sach-bao-mat']).toBeGreaterThanOrEqual(150);
  expect(words['chinh-sach-van-chuyen']).toBeGreaterThanOrEqual(150);
  const shipping = sitePages().find(page => page.slug === 'chinh-sach-van-chuyen')!;
  const table = shipping.sections.find(section => section.table)!.table!;
  expect(table.rows.map(row => row[0])).toEqual(['Hồ Chí Minh', 'Hà Nội', 'Các tỉnh/thành khác']);
  expect(table.rows[0][1]).toContain('20.000');
  for (const page of sitePages()) {
    const html = (await api.get('/seo/trang/' + page.slug).expect(200)).text;
    const { title, description } = meta(html);
    expect(title.length, page.slug).toBeLessThanOrEqual(60);
    expect(description.length, page.slug).toBeGreaterThanOrEqual(120);
    expect(description.length, page.slug).toBeLessThanOrEqual(155);
    expect(html).toContain('<link rel="canonical" href="https://long-fish.example' + page.path + '" />');
  }
});

test('trang Liên hệ có LocalBusiness khi đã cấu hình địa chỉ, và ContactPage', async () => {
  const html = (await api.get('/seo/trang/lien-he').expect(200)).text;
  const types = ld(html).map(item => item['@type']);
  expect(types).toEqual(['BreadcrumbList', 'ContactPage', 'LocalBusiness']);
  const business = ld(html)[2];
  expect(business.address.streetAddress).toContain('Nguyễn Huệ');
  await api.get('/seo/trang/khong-co').expect(404);
});

test('API nội dung: /api/site, /api/categories (kèm số lượng), /api/pages/:slug', async () => {
  expect((await api.get('/api/site').expect(200)).body).toMatchObject({ name: 'Long Fish', phone: '0900 000 000', facebook: 'https://www.facebook.com/long-fish-test' });
  const categories = (await api.get('/api/categories').expect(200)).body as { slug: string; count: number }[];
  expect(categories.map(item => [item.slug, item.count])).toEqual([['betta', 1], ['thiet-bi', 1]]);
  expect((await api.get('/api/pages/chinh-sach-doi-tra').expect(200)).body.h1).toBe('Chính sách đổi trả & hoàn tiền');
  await api.get('/api/pages/khong-co').expect(404);
});

test('biểu mẫu Liên hệ: lưu tin nhắn, kiểm tra dữ liệu, bẫy chống bot, giới hạn tần suất', async () => {
  await api.post('/api/contact').send({ name: 'An', email: 'khong-phai-email', message: 'Nội dung đủ dài để gửi' }).expect(422);
  await api.post('/api/contact').send({ name: 'An', email: 'an@example.com', message: 'ngắn' }).expect(422);
  await api.post('/api/contact').send({ name: 'Bot', email: 'bot@example.com', message: 'Mua thuốc giá rẻ tại đây', website: 'http://spam.example' }).expect(201);
  expect(await db.contactMessage.count()).toBe(0);
  await api.post('/api/contact').send({ name: 'An', email: 'an@example.com', message: 'Cho mình hỏi về cá Betta nhé' }).expect(201);
  expect(await db.contactMessage.findMany()).toMatchObject([{ name: 'An', email: 'an@example.com', status: 'NEW' }]);
  let blocked = false;
  for (let i = 0; i < 8; i++) {
    const response = await api.post('/api/contact').send({ name: 'An', email: 'an@example.com', message: 'Tin nhắn số ' + i + ' để thử' });
    if (response.status === 429) blocked = true;
  }
  expect(blocked).toBe(true);
});

test('sitemap có trang chủ, danh mục, sản phẩm đang bán và trang nội dung; không có trang riêng tư hay sản phẩm ẩn; robots.txt chặn trang riêng tư', async () => {
  const xml = (await api.get('/seo/sitemap.xml').expect(200).expect('Content-Type', /application\/xml/)).text;
  for (const path of ['/', '/danh-muc/betta', '/danh-muc/thiet-bi', '/san-pham/betta-halfmoon', '/gioi-thieu', '/lien-he', '/chinh-sach-doi-tra', '/chinh-sach-bao-mat', '/chinh-sach-van-chuyen']) {
    expect(xml, path).toContain('<loc>https://long-fish.example' + path + '</loc>');
  }
  for (const path of ['da-an', '/checkout', '/confirmation', '/track', '/admin', '/product/']) expect(xml, path).not.toContain(path);
  const robots = (await api.get('/seo/robots.txt').expect(200)).text;
  for (const line of ['Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout', 'Disallow: /confirmation', 'Disallow: /track', 'Sitemap: https://long-fish.example/sitemap.xml']) expect(robots).toContain(line);
});

test('trang HTML do backend trả có CSP cho phép ảnh QR VietQR và ảnh https (không bị chặn như mặc định helmet)', async () => {
  for (const path of ['/seo/home', '/seo/san-pham/betta-halfmoon', '/seo/danh-muc/betta', '/seo/trang/gioi-thieu']) {
    const csp = String((await api.get(path).expect(200)).headers['content-security-policy']);
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  }
});

test('fitDescription/fitTitle: đệm khi quá ngắn, cắt theo từ khi quá dài', () => {
  expect(seoLib.fitDescription('Ngắn').length).toBeGreaterThanOrEqual(120);
  expect(seoLib.fitDescription('từ '.repeat(200)).length).toBeLessThanOrEqual(155);
  expect(seoLib.fitTitle('A'.repeat(50), [' — Long Fish | Giá Tốt', ' — Long Fish', '']).length).toBeLessThanOrEqual(60);
  expect(seoLib.fitTitle('Cá', [' — Long Fish | Giá Tốt'])).toBe('Cá — Long Fish | Giá Tốt');
});
