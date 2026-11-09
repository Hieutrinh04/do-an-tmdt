import { db } from './db';
import { catalogFallbacks, legacyCatalogFallbacks } from '../prisma/catalog-images';
import { isCatalogImage } from './image-path';

type ApplyInput = { photos: Record<string, string[]>; only?: string; dryRun?: boolean; refresh?: boolean };

export async function applyCatalogPhotos(input: ApplyInput) {
  const known = Object.keys(catalogFallbacks);
  if (input.only && !known.includes(input.only)) throw new Error('Slug không thuộc danh mục mẫu.');
  const targets = input.only ? [input.only] : known;
  const result: { slug: string; action: string }[] = [];

  await db.$transaction(async tx => {
    for (const slug of targets) {
      const files = input.photos[slug];
      if (!files?.length && !input.refresh) continue;
      const prefix = '/catalog/photos/' + slug + '-';
      const next = files?.length ? files : catalogFallbacks[slug];
      if (files?.some(file => !file.startsWith(prefix) || !isCatalogImage(file))) {
        throw new Error('Đường dẫn ảnh không hợp lệ cho ' + slug);
      }
      const product = await tx.product.findUnique({ where: { slug }, select: { id: true, images: true } });
      if (!product) { result.push({ slug, action: 'Chưa có sản phẩm trong DB' }); continue; }
      const current = product.images;
      if (!Array.isArray(current) || !current.every((file): file is string => typeof file === 'string' &&
          (catalogFallbacks[slug].includes(file) || legacyCatalogFallbacks[slug].includes(file) || (file.startsWith(prefix) && isCatalogImage(file))))) {
        result.push({ slug, action: 'Giữ ảnh do quản trị viên đặt' });
        continue;
      }
      if (JSON.stringify(current) === JSON.stringify(next)) {
        result.push({ slug, action: 'Đã khớp' });
        continue;
      }
      if (input.dryRun) { result.push({ slug, action: 'Sẽ cập nhật ' + next.length + ' ảnh' }); continue; }
      const update = await tx.product.updateMany({ where: { id: product.id, images: { equals: current } }, data: { images: next } });
      result.push({ slug, action: update.count ? 'Đã cập nhật ' + next.length + ' ảnh' : 'Ảnh vừa thay đổi, bỏ qua' });
    }
  }, { timeout: 30000 });

  return result;
}

