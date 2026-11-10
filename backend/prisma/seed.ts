import bcrypt from 'bcryptjs';
import { OrderStatus, PaymentMethod, PaymentStatus, ProductVariant, Product } from '@prisma/client';
import { addDays, dayKey, dayStart, env } from '../src/env';
import { db } from '../src/db';

import { fish, supplies } from './aquatic-catalog';
import { seedImages } from './catalog-images';
import { quote } from '../src/domain';

const names = ['Nguyễn Minh An', 'Trần Thảo Linh', 'Lê Quốc Huy', 'Phạm Mai Anh', 'Võ Hoàng Nam', 'Đặng Thu Hà', 'Bùi Đức Khánh', 'Đỗ Ngọc Lan', 'Hồ Gia Hân', 'Vũ Thanh Tùng'];

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PENDING'],
  CONFIRMED: ['PENDING', 'CONFIRMED'],
  SHIPPING: ['PENDING', 'CONFIRMED', 'SHIPPING'],
  DELIVERED: ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED'],
  CANCELLED: ['PENDING', 'CANCELLED'],
};


// Mã giảm giá mẫu theo yêu cầu đồ án: WELCOME10 (%), FREESHIP (miễn phí vận chuyển), SALE20 (số tiền cố định, theo danh mục, 1 lần/người).
// Dữ liệu khuyến mãi theo lịch và sản phẩm mua kèm chỉ tạo lần đầu (khi chưa có WELCOME10) để không ghi đè chỉnh sửa của admin.
async function seedCommerce(withProducts: boolean) {
  const first = !(await db.coupon.findUnique({ where: { code: 'WELCOME10' } }));
  const now = new Date();
  const coupons = [
    { code: 'WELCOME10', kind: 'PERCENT', value: 10, description: 'Giảm 10% cho đơn hàng đầu tiên (tặng khách đăng ký tài khoản mới).', minSubtotal: 0, categories: [], firstOrderOnly: true, perCustomerLimit: 1, expiresAt: null },
    { code: 'FREESHIP', kind: 'FREESHIP', value: 0, description: 'Miễn phí vận chuyển cho đơn từ 300.000 ₫.', minSubtotal: 300000, categories: [], firstOrderOnly: false, perCustomerLimit: 0, expiresAt: addDays(now, 30) },
    { code: 'SALE20', kind: 'FIXED', value: 20000, description: 'Giảm 20.000 ₫ cho sản phẩm thiết bị, mỗi khách dùng 1 lần.', minSubtotal: 0, categories: ['Thiết bị'], firstOrderOnly: false, perCustomerLimit: 1, expiresAt: null },
  ];
  for (const coupon of coupons) await db.coupon.upsert({ where: { code: coupon.code }, update: {}, create: coupon });
  if (!first || !withProducts) return;

  const sales: [string, number, number | null][] = [
    ['betta-halfmoon', 59000, null], ['guppy-fancy', 24000, 14], ['be-kinh-40', 239000, 30], ['loc-thac', 149000, 30], ['ca-vang-ranchu', 129000, null],
  ];
  for (const [slug, salePrice, days] of sales) {
    const product = await db.product.findUnique({ where: { slug } });
    if (product && salePrice < product.price && product.salePrice == null) {
      await db.product.update({ where: { id: product.id }, data: { salePrice, saleStartsAt: null, saleEndsAt: days ? addDays(now, days) : null } });
    }
  }
  const links: Record<string, { CROSSSELL: string[]; UPSELL: string[] }> = {
    'betta-halfmoon': { CROSSSELL: ['hat-betta', 'suoi-be-ca', 'vi-sinh', 'be-kinh-40'], UPSELL: ['betta-plakat-koi', 'betta-crowntail'] },
    'guppy-fancy': { CROSSSELL: ['artemia-say', 'ray-nana', 'loc-thac'], UPSELL: ['guppy-full-red'] },
    'neon-tetra': { CROSSSELL: ['ray-nana', 'den-led', 'vi-sinh'], UPSELL: ['cardinal-tetra'] },
    'ca-vang-ranchu': { CROSSSELL: ['loc-thac', 'sui-oxy'], UPSELL: ['ca-vang-oranda'] },
    'be-kinh-40': { CROSSSELL: ['loc-thac', 'den-led', 'suoi-be-ca', 'sui-oxy'], UPSELL: [] },
  };
  for (const [slug, groups] of Object.entries(links)) {
    const product = await db.product.findUnique({ where: { slug } });
    if (!product) continue;
    for (const type of ['CROSSSELL', 'UPSELL'] as const) {
      for (const linkedSlug of groups[type]) {
        const linked = await db.product.findUnique({ where: { slug: linkedSlug } });
        if (linked) await db.productLink.upsert({ where: { productId_linkedId_type: { productId: product.id, linkedId: linked.id, type } }, update: {}, create: { productId: product.id, linkedId: linked.id, type } });
      }
    }
  }
}

export async function seed(replenish = false) {
  if (env.ADMIN_PASSWORD && (env.ADMIN_PASSWORD.length < 12 || Buffer.byteLength(env.ADMIN_PASSWORD) > 72)) {
    throw new Error('ADMIN_PASSWORD phải từ 12 ký tự đến tối đa 72 byte.');
  }
  if (env.ADMIN_PASSWORD) {
    await db.adminUser.upsert({
      where: { username: env.ADMIN_USERNAME || 'admin' },
      create: {
        username: env.ADMIN_USERNAME || 'admin',
        passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
      },
      update: {},
    });
  }
  if (env.SEED_DEMO === 'false') { await seedCommerce(false); return; }

  const variants: (ProductVariant & { product: Product })[] = [];
  for (const [name, slug, category, price, , first, second, size, minQty, careInfo] of fish) {
    const gendered = category === 'Betta' || category === 'Guppy';
    const product = await db.product.upsert({
      where: { slug }, update: {}, create: {
        name, slug, category, price, isLiveFish: true, careInfo, images: seedImages(slug),
        description: name + '. ' + careInfo.temperament + ' Cỡ bán: ' + size + '.',
        variants: { create: [
          { color: first, size, gender: gendered ? 'Đực' : 'Không phân biệt', stock: 28, code: '01' },
          { color: first, size: gendered ? size : ({ '2–3 cm': '3–4 cm', '3–4 cm': '2–3 cm', '5–6 cm': '4–5 cm', '7–9 cm': '5–6 cm', '10 cm+': '12 cm+' })[size], gender: gendered ? 'Cái' : 'Không phân biệt', stock: 3, code: '02' },
          { color: second, size, gender: gendered ? 'Đực' : 'Không phân biệt', stock: 0, code: '03' },
          ...(category === 'Guppy' ? [{ color: second, size, gender: 'Cặp', stock: 12, code: '04' }] : []),
        ].map(({ code, ...row }) => ({
          ...row, minQty, unit: row.gender === 'Cặp' ? 'cặp' : 'con',
          sku: 'LF-' + slug.toUpperCase() + '-' + code + '-' + ({ 'Đực': 'M', 'Cái': 'F', 'Cặp': 'PAIR', 'Không phân biệt': 'U' })[row.gender as 'Đực' | 'Cái' | 'Cặp' | 'Không phân biệt'],
          priceOverride: row.gender === 'Cặp' ? price * 2 : null,
        })) },
      }, include: { variants: { orderBy: { sku: 'asc' } } },
    });
    if (product.variants[0]) variants.push({ ...product.variants[0], product });
  }
  for (const [name, slug, category, price, , size, unit, description] of supplies) {
    const product = await db.product.upsert({
      where: { slug }, update: {}, create: {
        name, slug, category, price, description, images: seedImages(slug),
        variants: { create: [{ color: 'Mặc định', size, unit, sku: 'LF-' + slug.toUpperCase() + '-01', stock: 18 },
          ...(slug === 'loc-thac' ? [{ color: 'Mặc định', size: '40 W', unit, sku: 'LF-LOC-THAC-02', stock: 4, priceOverride: 245000 }] : [])] },
      }, include: { variants: { orderBy: { sku: 'asc' } } },
    });
    if (product.variants[0]) variants.push({ ...product.variants[0], product });
  }

  await seedCommerce(true);

  await db.$transaction(async (tx) => {
    const existing = replenish ? await tx.order.findMany({ where: { OR: [
      { note: 'Mẫu Long Fish' },
      { customerName: { in: names }, phone: { startsWith: '09000000' }, address: '12 Nguyễn Huệ, Quận 1, Hồ Chí Minh' },
    ] }, select: { code: true } }) : [];
    if (!replenish && await tx.order.count()) return;
    const today = dayStart(dayKey(new Date()));
    for (let i = existing.length; i < 30; i++) {
      const daysAgo = i < 15 ? i : (i - 14) * 21;
      const createdAt = new Date(addDays(today, -daysAgo).getTime() + (i === 0 ? 0 : 9 * 3600_000));
      const day = dayKey(createdAt).replaceAll('-', '');
      const sequence = await tx.orderSequence.upsert({
        where: { day }, create: { day, value: 1 }, update: { value: { increment: 1 } },
      });
      const status = i === 0 ? OrderStatus.DELIVERED : i % 9 === 0 ? OrderStatus.PENDING :
        i % 7 === 0 ? OrderStatus.CANCELLED : i % 6 === 0 ? OrderStatus.SHIPPING :
        i % 8 === 0 ? OrderStatus.CONFIRMED : OrderStatus.DELIVERED;
      const variant = variants[i % variants.length];
      if (!variant) throw new Error('Không có phân loại để tạo đơn mẫu.');
      const quantity = Math.max(variant.minQty, i % 3 + 1);
      const unitPrice = variant.priceOverride ?? variant.product.price;
      const subtotal = unitPrice * quantity;
      const { shippingFee, packingFee, total, hasLiveFish } = quote('Hồ Chí Minh', subtotal, variant.product.isLiveFish);
      await tx.order.create({ data: {
        code: 'DH' + day + '-' + String(sequence.value).padStart(4, '0'),
        customerName: names[i % names.length],
        phone: '09000000' + String(i + 1).padStart(2, '0'),
        address: '12 Nguyễn Huệ, Quận 1, Hồ Chí Minh',
        paymentMethod: i % 2 ? PaymentMethod.COD : PaymentMethod.BANK_QR,
        paymentStatus: status === 'DELIVERED' ? PaymentStatus.PAID : PaymentStatus.UNPAID,
        subtotal, shippingFee, packingFee, total, hasLiveFish, doaAccepted: hasLiveFish, status, createdAt, note: 'Mẫu Long Fish',
        items: { create: { variantId: variant.id, color: variant.color, size: variant.size,
          productName: variant.product.name, category: variant.product.category, isLiveFish: hasLiveFish,
          gender: variant.gender, unit: variant.unit, quantity, unitPrice } },
        history: { create: transitions[status].map((toStatus, index, list) => ({
          fromStatus: list[index - 1], toStatus,
          changedAt: new Date(createdAt.getTime() + index * 1000),
        })) },
      } });
    }
  });
  console.info('Dữ liệu mẫu đã sẵn sàng.');
}

if (require.main === module) seed().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());


