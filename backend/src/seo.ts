import { Router, Request } from 'express';
import { db } from './db';
import { unitPrices } from './commerce';
import { env } from './env';
import { clip, fitDescription, fitTitle, TITLE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX } from './seo-text';
import { categories, categoryByName, categoryBySlug, pageBySlug, siteInfo, sitePages } from './site-content';

// SEO phía máy chủ: nginx chuyển trang chủ, /san-pham/<slug>, /danh-muc/<slug>, các trang nội dung, /sitemap.xml và /robots.txt vào đây.
// Mỗi trang trả về chính index.html của giao diện nhưng đã chèn sẵn title, mô tả, canonical, Open Graph và JSON-LD,
// để bộ thu thập không chạy JavaScript (Facebook, Zalo, Messenger) vẫn đọc được. Giao diện React vẫn chạy như bình thường.

const shopName = () => env.SHOP_NAME?.trim() || 'Long Fish';
const money = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeXml = (value: string) => escapeHtml(value).replace(/'/g, '&apos;');
const jsonLd = (data: unknown) => '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>';
export { fitDescription, fitTitle, TITLE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX };

function baseUrl(req: Request) {
  const configured = (env.SITE_URL || '').trim().replace(/\/$/, '');
  if (/^https?:\/\//.test(configured)) return configured;
  const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0];
  return proto + '://' + req.get('host');
}
const absolute = (base: string, path: string) => /^https?:\/\//.test(path) ? path : base + (path.startsWith('/') ? path : '/' + path);

const shell = { html: '', at: 0 };
async function loadShell() {
  if (shell.html && Date.now() - shell.at < 30_000) return shell.html;
  const response = await fetch(env.FRONTEND_SHELL_URL || 'http://frontend/index.html', { signal: AbortSignal.timeout(4000) });
  const html = await response.text();
  if (!response.ok || !/<div id="root">/.test(html)) throw new Error('Không đọc được index.html của giao diện.');
  shell.html = html; shell.at = Date.now();
  return html;
}

type Meta = { title: string; description: string; canonical: string; image?: string; imageSize?: [number, number]; type?: 'website' | 'product'; data?: unknown[] };
function render(html: string, meta: Meta) {
  const name = shopName();
  const tags = [
    '<title>' + escapeHtml(meta.title) + '</title>',
    '<meta name="description" content="' + escapeHtml(meta.description) + '" />',
    '<link rel="canonical" href="' + escapeHtml(meta.canonical) + '" />',
    '<meta property="og:site_name" content="' + escapeHtml(name) + '" />',
    '<meta property="og:locale" content="vi_VN" />',
    '<meta property="og:type" content="' + (meta.type === 'product' ? 'product' : 'website') + '" />',
    '<meta property="og:title" content="' + escapeHtml(meta.title) + '" />',
    '<meta property="og:description" content="' + escapeHtml(meta.description) + '" />',
    '<meta property="og:url" content="' + escapeHtml(meta.canonical) + '" />',
    ...(meta.image ? ['<meta property="og:image" content="' + escapeHtml(meta.image) + '" />', '<meta name="twitter:image" content="' + escapeHtml(meta.image) + '" />'] : []),
    ...(meta.image && meta.imageSize ? ['<meta property="og:image:width" content="' + meta.imageSize[0] + '" />', '<meta property="og:image:height" content="' + meta.imageSize[1] + '" />'] : []),
    '<meta name="twitter:card" content="' + (meta.image ? 'summary_large_image' : 'summary') + '" />',
    '<meta name="twitter:title" content="' + escapeHtml(meta.title) + '" />',
    '<meta name="twitter:description" content="' + escapeHtml(meta.description) + '" />',
    ...(meta.data || []).map(jsonLd),
  ].join('\n');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/i, '')
    .replace(/<\/head>/i, tags + '\n</head>');
}

// Ảnh Open Graph mặc định 1200×630 (hướng dẫn: Social Graph).
const defaultImage = (base: string) => base + '/og-default.jpg';
const OG_SIZE: [number, number] = [1200, 630];

function socialLinks() {
  const info = siteInfo();
  return [info.facebook, info.tiktok, info.instagram].filter(Boolean);
}

function organization(base: string) {
  const info = siteInfo();
  return {
    '@context': 'https://schema.org', '@type': 'Organization', name: info.name, url: base, logo: base + '/fish.svg',
    ...(socialLinks().length ? { sameAs: socialLinks() } : {}),
    ...(info.phone || info.email ? { contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', areaServed: 'VN', availableLanguage: 'vi',
      ...(info.phone ? { telephone: info.phone } : {}), ...(info.email ? { email: info.email } : {}) } } : {}),
  };
}

function breadcrumb(base: string, trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: base + item.path })),
  };
}

export const seo = Router();

// Trang HTML do backend trả về phải có CSP đúng cho giao diện: ảnh QR VietQR và ảnh sản phẩm dùng link https bên ngoài cần img-src https:.
// (Mặc định của helmet là img-src 'self' data:, sẽ chặn ảnh QR thanh toán.)
export const pageCsp = [
  "default-src 'self'", "base-uri 'self'", "font-src 'self' https: data:", "form-action 'self'", "frame-ancestors 'self'",
  "img-src 'self' data: https:", "object-src 'none'", "script-src 'self'", "script-src-attr 'none'",
  "style-src 'self' https: 'unsafe-inline'", "connect-src 'self'", 'upgrade-insecure-requests',
].join(';');

const sendHtml = (res: import('express').Response, html: string) =>
  res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'public, max-age=60')
    .set('Content-Security-Policy', pageCsp).send(html);

seo.get('/home', async (req, res) => {
  const base = baseUrl(req);
  const name = shopName();
  sendHtml(res, render(await loadShell(), {
    title: fitTitle(name + ' – Cá Cảnh Nước Ngọt & Thủy Sinh', []),
    description: fitDescription('Mua cá cảnh nước ngọt Betta, Guppy, Neon Tetra, Koi mini, cây thủy sinh, thức ăn và thiết bị tại ' + name + '. Xem thông số nuôi, tồn kho rõ ràng, đặt hàng ngay.'),
    canonical: base + '/', image: defaultImage(base), imageSize: OG_SIZE,
    data: [organization(base), { '@context': 'https://schema.org', '@type': 'WebSite', name, url: base }],
  }));
});

async function productsOf(categoryName: string) {
  return db.product.findMany({
    where: { category: categoryName, isActive: true, variants: { some: { isActive: true } } },
    include: { variants: { where: { isActive: true } } }, orderBy: { createdAt: 'asc' },
  });
}

seo.get('/danh-muc/:slug', async (req, res) => {
  const item = categoryBySlug(String(req.params.slug));
  if (!item) { res.status(404).end(); return; }
  const rows = await productsOf(item.name);
  if (!rows.length) { res.status(404).end(); return; }
  const base = baseUrl(req);
  const name = shopName();
  const canonical = base + '/danh-muc/' + item.slug;
  const year = new Date().getFullYear();
  const low = Math.min(...rows.flatMap(row => row.variants.map(variant => unitPrices(row, variant).unit)));
  sendHtml(res, render(await loadShell(), {
    title: fitTitle(item.name + ' — ' + name, [' | Hàng Mới ' + year, ' | Giá Tốt', '']),
    description: fitDescription('Mua ' + item.name + ' tại ' + name + ': ' + rows.length + ' sản phẩm, giá từ ' + money(low) + '. ' + item.description),
    canonical, image: defaultImage(base), imageSize: OG_SIZE,
    data: [
      breadcrumb(base, [{ name: 'Trang chủ', path: '/' }, { name: item.name, path: '/danh-muc/' + item.slug }]),
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: item.name, description: item.description, url: canonical,
        mainEntity: { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.map((row, index) => ({ '@type': 'ListItem', position: index + 1, url: base + '/san-pham/' + row.slug, name: row.name })) } },
    ],
  }));
});

seo.get('/san-pham/:slug', async (req, res) => {
  const product = await db.product.findFirst({
    where: { slug: String(req.params.slug), isActive: true },
    include: { variants: { where: { isActive: true }, orderBy: { sku: 'asc' } } },
  });
  if (!product || !product.variants.length) { res.status(404).end(); return; }
  const base = baseUrl(req);
  const name = shopName();
  const prices = product.variants.map(row => unitPrices(product, row).unit);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const inStock = product.variants.some(row => row.stock >= row.minQty);
  const images = (Array.isArray(product.images) ? product.images : []).filter((value): value is string => typeof value === 'string');
  const canonical = base + '/san-pham/' + product.slug;
  const image = images[0] ? absolute(base, images[0]) : undefined;
  const group = categoryByName(product.category);
  const trail = [{ name: 'Trang chủ', path: '/' }, ...(group ? [{ name: group.name, path: '/danh-muc/' + group.slug }] : []), { name: product.name, path: '/san-pham/' + product.slug }];
  sendHtml(res, render(await loadShell(), {
    title: fitTitle(product.name + ' — ' + name, [' | Giá Tốt', '']),
    description: fitDescription(product.name + ' giá từ ' + money(low) + (inStock ? ' – còn hàng. ' : ' – tạm hết hàng. ') + product.description),
    canonical, image, type: 'product',
    data: [
      {
        '@context': 'https://schema.org', '@type': 'Product', name: product.name, description: clip(product.description, 500),
        image: images.map(value => absolute(base, value)), sku: product.variants[0].sku, category: product.category,
        brand: { '@type': 'Brand', name },
        offers: {
          '@type': 'AggregateOffer', priceCurrency: 'VND', lowPrice: low, highPrice: high, offerCount: product.variants.length, url: canonical,
          availability: 'https://schema.org/' + (inStock ? 'InStock' : 'OutOfStock'), seller: { '@type': 'Organization', name },
        },
      },
      breadcrumb(base, trail),
    ],
  }));
});

seo.get('/trang/:slug', async (req, res) => {
  const page = pageBySlug(String(req.params.slug));
  if (!page) { res.status(404).end(); return; }
  const base = baseUrl(req);
  const info = siteInfo();
  const canonical = base + page.path;
  const data: unknown[] = [breadcrumb(base, [{ name: 'Trang chủ', path: '/' }, { name: page.h1, path: page.path }])];
  if (page.slug === 'lien-he') {
    data.push({ '@context': 'https://schema.org', '@type': 'ContactPage', name: page.title, url: canonical });
    // LocalBusiness chỉ khai báo khi cửa hàng đã cấu hình địa chỉ thật (SHOP_ADDRESS), tránh dữ liệu giả.
    if (info.address) data.push({
      '@context': 'https://schema.org', '@type': 'LocalBusiness', name: info.name, url: base, image: defaultImage(base), address: { '@type': 'PostalAddress', streetAddress: info.address, addressCountry: 'VN' },
      ...(info.phone ? { telephone: info.phone } : {}), ...(info.email ? { email: info.email } : {}), openingHours: info.hours,
      ...(socialLinks().length ? { sameAs: socialLinks() } : {}),
    });
  }
  sendHtml(res, render(await loadShell(), {
    title: fitTitle(page.title, []), description: fitDescription(page.description),
    canonical, image: defaultImage(base), imageSize: OG_SIZE, data,
  }));
});

seo.get('/sitemap.xml', async (req, res) => {
  const base = baseUrl(req);
  const rows = await db.product.findMany({ where: { isActive: true, variants: { some: { isActive: true } } }, select: { slug: true, category: true }, orderBy: { createdAt: 'asc' } });
  const present = new Set(rows.map(row => row.category));
  const urls = [
    { loc: base + '/', freq: 'daily', priority: '1.0' },
    ...categories.filter(item => present.has(item.name)).map(item => ({ loc: base + '/danh-muc/' + item.slug, freq: 'weekly', priority: '0.9' })),
    ...rows.map(row => ({ loc: base + '/san-pham/' + row.slug, freq: 'weekly', priority: '0.8' })),
    ...sitePages().map(page => ({ loc: base + page.path, freq: 'monthly', priority: page.slug === 'gioi-thieu' || page.slug === 'lien-he' ? '0.6' : '0.4' })),
    { loc: base + '/credits', freq: 'monthly', priority: '0.2' },
  ];
  res.set('Content-Type', 'application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(row => '  <url><loc>' + escapeXml(row.loc) + '</loc><changefreq>' + row.freq + '</changefreq><priority>' + row.priority + '</priority></url>').join('\n') +
    '\n</urlset>\n');
});

seo.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send([
    'User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout', 'Disallow: /confirmation', 'Disallow: /track',
    '', 'Sitemap: ' + baseUrl(req) + '/sitemap.xml', '',
  ].join('\n'));
});
