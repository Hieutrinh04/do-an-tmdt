import { Router, Request } from 'express';
import { db } from './db';
import { env } from './env';

// SEO phía máy chủ: nginx chuyển trang chủ, trang sản phẩm, sitemap và robots.txt vào đây.
// Mỗi trang trả về chính index.html của giao diện nhưng đã chèn sẵn title, mô tả, canonical, Open Graph và JSON-LD,
// để bộ thu thập không chạy JavaScript (Facebook, Zalo, Messenger) vẫn đọc được. Giao diện React vẫn chạy như bình thường.

const shopName = () => env.SHOP_NAME?.trim() || 'Long Fish';
const money = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeXml = (value: string) => escapeHtml(value).replace(/'/g, '&apos;');
const jsonLd = (data: unknown) => '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>';
const clip = (value: string, max: number) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
};

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

type Meta = { title: string; description: string; canonical: string; image?: string; type?: 'website' | 'product'; data?: unknown[] };
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

function organization(base: string) {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: shopName(), url: base, logo: base + '/fish.svg' };
}

export const seo = Router();

const sendHtml = (res: import('express').Response, html: string) =>
  res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'public, max-age=60').send(html);

seo.get('/home', async (req, res) => {
  const base = baseUrl(req);
  const name = shopName();
  sendHtml(res, render(await loadShell(), {
    title: name + ' · Cá cảnh nước ngọt, thủy sinh và thiết bị',
    description: 'Mua cá cảnh nước ngọt (Betta, Guppy, Neon, cá vàng, Koi…), cây thủy sinh, thức ăn và thiết bị tại ' + name + '. Xem thông số nuôi, tồn kho và chính sách giao cá sống.',
    canonical: base + '/', image: base + '/catalog/photos/betta-halfmoon-1.webp',
    data: [organization(base), { '@context': 'https://schema.org', '@type': 'WebSite', name, url: base }],
  }));
});

seo.get('/product/:slug', async (req, res) => {
  const product = await db.product.findFirst({
    where: { slug: String(req.params.slug), isActive: true },
    include: { variants: { where: { isActive: true }, orderBy: { sku: 'asc' } } },
  });
  if (!product || !product.variants.length) { res.status(404).end(); return; }
  const base = baseUrl(req);
  const name = shopName();
  const prices = product.variants.map(row => row.priceOverride ?? product.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const inStock = product.variants.some(row => row.stock >= row.minQty);
  const images = (Array.isArray(product.images) ? product.images : []).filter((value): value is string => typeof value === 'string');
  const canonical = base + '/product/' + product.slug;
  const image = images[0] ? absolute(base, images[0]) : undefined;
  const description = clip(product.name + ' giá từ ' + money(low) + (inStock ? ' – còn hàng. ' : ' – tạm hết hàng. ') + product.description, 160);
  sendHtml(res, render(await loadShell(), {
    title: clip(product.name + ' – ' + product.category + ' | ' + name, 70), description, canonical, image, type: 'product',
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
      {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: base + '/' },
          { '@type': 'ListItem', position: 2, name: product.category, item: base + '/?category=' + encodeURIComponent(product.category) },
          { '@type': 'ListItem', position: 3, name: product.name, item: canonical },
        ],
      },
    ],
  }));
});

seo.get('/sitemap.xml', async (req, res) => {
  const base = baseUrl(req);
  const rows = await db.product.findMany({ where: { isActive: true, variants: { some: { isActive: true } } }, select: { slug: true }, orderBy: { createdAt: 'asc' } });
  const urls = [{ loc: base + '/', freq: 'daily', priority: '1.0' }, { loc: base + '/credits', freq: 'monthly', priority: '0.2' },
    ...rows.map(row => ({ loc: base + '/product/' + row.slug, freq: 'weekly', priority: '0.8' }))];
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
