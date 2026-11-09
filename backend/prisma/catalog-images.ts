import { fish, supplies } from './aquatic-catalog';
import { catalogPhotos } from './photo-manifest';

const customFallbacks = new Set(['betta-plakat-koi', 'guppy-full-red', 'koi-mini', 'hat-betta', 'artemia-say',
  'be-kinh-40', 'den-led', 'suoi-be-ca', 'sui-oxy', 'vi-sinh']);

export const legacyCatalogFallbacks: Record<string, string[]> = Object.fromEntries(
  [...fish, ...supplies].map(row => [row[1], ['/catalog/' + row[4] + '.svg']]),
);

export const catalogFallbacks: Record<string, string[]> = Object.fromEntries(
  [...fish, ...supplies].map(row => [row[1], [
    '/catalog/' + (customFallbacks.has(row[1]) ? row[1] : row[4]) + '.svg', ...(row[1] === 'betta-halfmoon' ? ['/catalog/betta-blue.svg'] : []),
  ]]),
);

export function seedImages(slug: string) {
  return catalogPhotos[slug]?.length ? catalogPhotos[slug] : catalogFallbacks[slug];
}

