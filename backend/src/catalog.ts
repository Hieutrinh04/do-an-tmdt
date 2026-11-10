import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { isCatalogImage } from './image-path';
import { HttpError, normalize, required } from './domain';
import { unitPrices } from './commerce';

const price = z.number().int().min(0).max(20_000_000);
const slug = z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const genders = ['Đực', 'Cái', 'Cặp', 'Không phân biệt'] as const;
export const units = ['con', 'cặp', 'bộ', 'gói', 'cái'] as const;
export const difficulties = ['Dễ', 'Trung bình', 'Nâng cao'] as const;
export const careInfo = z.object({
  scientificName: required(100), adultCm: z.number().positive().max(500), temperature: required(80), ph: required(80),
  temperament: required(400), difficulty: z.enum(difficulties), food: required(200), minTankLiters: z.number().int().positive(),
  community: z.boolean(), algaeEater: z.boolean().default(false), compact: z.boolean().default(false),
  source: z.string().url().refine(value => value.startsWith('https://')).optional(),
});
const image = z.string().max(500).refine(isCatalogImage);
const productBase = z.object({
  name: required(120), slug, description: required(1500), price,
  images: z.array(image).min(1).max(6), category: required(80), isActive: z.boolean(),
  isLiveFish: z.boolean(), careInfo: careInfo.optional(),
  // Giá khuyến mãi (nhỏ hơn giá gốc) và lịch áp dụng; để trống = không khuyến mãi.
  salePrice: price.nullable().optional(),
  saleStartsAt: z.coerce.date().nullable().optional(), saleEndsAt: z.coerce.date().nullable().optional(),
});
export const productPatch = productBase.partial();
export const productInput = productBase.extend({ isActive: z.boolean().default(true), isLiveFish: z.boolean().default(false) });
const variantFields = z.object({
  color: required(70), size: required(30), sku: required(80), stock: z.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  gender: z.enum(genders), unit: z.enum(units), minQty: z.number().int().min(1).max(99),
  priceOverride: price.nullable().optional(), isActive: z.boolean(),
});
export const variantPatch = variantFields.partial();
export const variantInput = variantFields.extend({ gender: z.enum(genders).default('Không phân biệt'), unit: z.enum(units).default('cái'),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).default(5),
  minQty: z.number().int().min(1).max(99).default(1), isActive: z.boolean().default(true) });
const publicVariants = { where: { isActive: true }, orderBy: { sku: 'asc' as const } };

export async function products(search?: string, category?: string, maxPrice?: number) {
  const all = await db.product.findMany({
    where: { isActive: true, ...(maxPrice !== undefined ? { price: { lte: maxPrice } } : {}) },
    include: { variants: publicVariants }, orderBy: { createdAt: 'asc' },
  });
  const terms = normalize(search || '').split(' ').filter(Boolean);
  return all.filter(product => (!category || normalize(product.category) === normalize(category)) &&
    terms.every(term => normalize([product.name, product.category, product.description].join(' ')).includes(term))).map(product => withPricing(product));
}

export async function detail(slug: string) {
  const product = await db.product.findFirst({ where: { slug, isActive: true }, include: { variants: publicVariants } });
  if (!product) throw new HttpError(404, 'Không tìm thấy sản phẩm.');
  return withPricing(product);
}

export async function detailPage(slug: string) {
  const product = await detail(slug);
  const sellable = (row: { variants: { stock: number; minQty: number }[] }) => row.variants.some(variant => variant.stock >= variant.minQty);
  // Khi không còn phân loại nào đủ hàng, gợi ý tối đa 4 sản phẩm cùng nhóm còn hàng.
  const alternatives = sellable(product) ? [] : (await db.product.findMany({
    where: { isActive: true, category: product.category, id: { not: product.id } },
    include: { variants: publicVariants }, orderBy: { createdAt: 'asc' },
  })).filter(sellable).slice(0, 4).map(row => ({ id: row.id, name: row.name, slug: row.slug, price: row.price, images: row.images }));
  const links = await db.productLink.findMany({ where: { productId: product.id }, include: { linked: { include: { variants: publicVariants } } } });
  const linked = (type: string) => links.filter(link => link.type === type && link.linked.isActive && sellable(link.linked))
    .map(link => withPricing(link.linked)).map(row => ({ id: row.id, name: row.name, slug: row.slug, price: row.price, currentPrice: row.currentPrice,
      onSale: row.onSale, images: row.images, category: row.category, variants: row.variants }));
  return { ...product, alternatives, crossSells: linked('CROSSSELL'), upSells: linked('UPSELL') };
}

export async function stock(id: string, color?: string, size?: string, gender?: string) {
  const variants = await db.productVariant.findMany({ where: { productId: id, isActive: true, product: { isActive: true } } });
  const matches = variants.filter(row =>
    (!color || normalize(row.color) === normalize(color)) && (!size || normalize(row.size) === normalize(size)) &&
    (!gender || normalize(row.gender) === normalize(gender)));
  const quantity = matches.reduce((total, row) => total + row.stock, 0);
  return { inStock: matches.some(row => row.stock >= row.minQty), stock: quantity };
}

export async function removeVariant(productId: string, id: string) {
  const changed = await db.productVariant.updateMany({ where: { id, productId }, data: { isActive: false } });
  if (!changed.count) throw new HttpError(404, 'Không tìm thấy phân loại.');
}

export async function updateVariant(productId: string, id: string, data: Prisma.ProductVariantUpdateManyMutationInput) {
  const changed = await db.productVariant.updateMany({ where: { id, productId }, data });
  if (!changed.count) throw new HttpError(404, 'Không tìm thấy phân loại.');
  return db.productVariant.findUniqueOrThrow({ where: { id } });
}


// Giá hiện hành (đã tính khuyến mãi theo lịch) cho từng sản phẩm và phân loại, dùng chung giao diện, bot và SEO.
type PricedVariant = { priceOverride: number | null };
type Priceable<V extends PricedVariant> = { price: number; salePrice: number | null; saleStartsAt: Date | null; saleEndsAt: Date | null; variants: V[] };
export function withPricing<T extends Priceable<PricedVariant>>(product: T, now = new Date()): Omit<T, 'variants'> & {
  currentPrice: number; onSale: boolean; salePercent: number; variants: (T['variants'][number] & { unitPrice: number; regularPrice: number; onSale: boolean })[];
} {
  const base = unitPrices(product, null, now);
  return {
    ...product, currentPrice: base.unit, onSale: base.onSale, salePercent: base.onSale ? Math.round((1 - base.unit / base.regular) * 100) : 0,
    variants: product.variants.map(variant => {
      const price = unitPrices(product, variant, now);
      return { ...variant, unitPrice: price.unit, regularPrice: price.regular, onSale: price.onSale };
    }),
  };
}
