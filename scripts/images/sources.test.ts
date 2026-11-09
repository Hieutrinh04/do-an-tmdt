import { expect, test } from 'vitest';
import { allowedByRobots } from './robots';
import { commercialLicense, plain, safePhotoUrl, score, Candidate } from './sources';
import { isCatalogImage, thumbnailPath } from '../../backend/src/image-path';

const sample: Candidate = {
  source: 'commons', title: 'File:Paracheirodon innesi.jpg', description: 'Neon tetra photograph',
  author: 'Photographer', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Paracheirodon_innesi.jpg',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Paracheirodon_innesi.jpg',
  width: 2400, height: 1800,
};
const query = { terms: ['Paracheirodon innesi neon tetra', 'Paracheirodon innesi'], approved: [] };

test('ưu tiên metadata khớp loài hơn ảnh cá khác', () => {
  expect(score(sample, query)).toBeGreaterThan(score({ ...sample, title: 'Goldfish', description: 'Carassius auratus' }, query));
});

test('loại ảnh nhỏ, ảnh vẽ, host lạ và giấy phép không phù hợp', () => {
  for (const patch of [
    { width: 599 }, { width: 10000 }, { title: 'Neon tetra drawing' },
    { license: 'CC BY-NC 4.0' }, { license: 'CC BY-ND 4.0' },
    { licenseUrl: 'https://example.com/fake' }, { imageUrl: 'http://127.0.0.1/a.jpg' },
    { imageUrl: 'https://evil.example/a.jpg' }, { author: '' },
  ]) expect(score({ ...sample, ...patch }, query)).toBe(0);
  expect(commercialLicense('CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/')).toBe(true);
  expect(plain(null)).toBe('');
  expect(safePhotoUrl('https://inaturalist-open-data.s3.amazonaws.com/photos/123/original.jpg')).toBe(true);
  expect(safePhotoUrl('https://inaturalist-open-data.s3.amazonaws.com/metadata.csv')).toBe(false);
});

test('đường dẫn WebP sản phẩm được chấp nhận, chặn traversal và ảnh thumbnail làm ảnh gốc', () => {
  for (const path of ['/catalog/betta.svg', '/catalog/photos/neon-tetra-1.webp', '/catalog/photos/ca-dia-3.webp']) {
    expect(isCatalogImage(path)).toBe(true);
  }
  for (const path of ['/catalog/photos/../secret.webp', '/catalog/photos/neon-tetra-1-thumb.webp',
    '/catalog//bad.webp', 'javascript:alert(1)', 'https://user:password@example.com/a.jpg']) {
    expect(isCatalogImage(path)).toBe(false);
  }
  expect(thumbnailPath('/catalog/photos/neon-tetra-1.webp')).toBe('/catalog/photos/neon-tetra-1-thumb.webp');
  expect(thumbnailPath('/catalog/neon.svg')).toBe('/catalog/neon.svg');
});

test('robots ưu tiên quy tắc cụ thể, giữ API và tệp ảnh đúng phạm vi', () => {
  const text = 'User-agent: *\nDisallow: /private/\nAllow: /private/ok/\n';
  expect(allowedByRobots(text, new URL('https://upload.wikimedia.org/private/no.jpg'))).toBe(false);
  expect(allowedByRobots(text, new URL('https://upload.wikimedia.org/private/ok/a.jpg'))).toBe(true);
});
