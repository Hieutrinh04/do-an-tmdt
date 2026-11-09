import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { allowedByRobots } from './robots';
import { assertNotCoolingDown, coolDown } from './rate-limit';

export type Source = 'commons' | 'openverse' | 'pexels' | 'pixabay';
export type Candidate = {
  source: Source; title: string; description: string; author: string; license: string;
  licenseUrl: string; sourceUrl: string; imageUrl: string; width: number; height: number;
};
export type Query = { terms: string[]; approved: string[]; openverseTerm?: string; reviewNote?: string; photoAdvice?: string };

const commonsEndpoint = 'https://commons.wikimedia.org/w/api.php';
const openverseEndpoint = 'https://api.openverse.org/v1/images/';
const robotsCache = new Map<string, Promise<string>>();
async function robotsAllowed(input: string) {
  const url = new URL(input);
  let rules = robotsCache.get(url.origin);
  if (!rules) {
    rules = (async () => {
      try { return await (await request(url.origin + '/robots.txt')).text(); }
      catch (error) {
        if ((error as Error).message.endsWith('HTTP 404')) return '';
        throw new Error('Không kiểm tra được robots.txt của ' + url.hostname + ': ' + (error as Error).message);
      }
    })();
    robotsCache.set(url.origin, rules);
  }
  if (!allowedByRobots(await rules, url)) throw new Error('robots.txt từ chối ' + url.hostname + url.pathname);
}
const fileHosts = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org', 'images.pexels.com', 'cdn.pixabay.com', 'pixabay.com', 'live.staticflickr.com', 'farm1.staticflickr.com', 'farm2.staticflickr.com', 'farm3.staticflickr.com', 'farm4.staticflickr.com', 'farm5.staticflickr.com', 'farm6.staticflickr.com', 'farm7.staticflickr.com', 'farm8.staticflickr.com', 'farm9.staticflickr.com']);
let nextRequest = 0;

export function safePhotoUrl(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (fileHosts.has(url.hostname) || url.hostname === 'inaturalist-open-data.s3.amazonaws.com' &&
        /^\/photos\/\d+\/original\.(?:jpeg|jpg|png|webp)$/i.test(url.pathname));
  } catch { return false; }
}

export async function request(url: string, headers: Record<string, string> = {}) {
  const endpoint = new URL(url);
  const officialApi = endpoint.origin === 'https://commons.wikimedia.org' && endpoint.pathname === '/w/api.php' ||
    endpoint.origin === 'https://api.openverse.org' && endpoint.pathname === '/v1/images/' ||
    endpoint.origin === 'https://api.pexels.com' && endpoint.pathname === '/v1/search' ||
    endpoint.origin === 'https://pixabay.com' && endpoint.pathname === '/api/';
  if (!officialApi && !endpoint.pathname.endsWith('/robots.txt')) await robotsAllowed(url);
  await assertNotCoolingDown(endpoint.hostname);
  for (let retry = 0; ; retry++) {
    const now = Date.now();
    const start = Math.max(now, nextRequest);
    nextRequest = start + 1100;
    if (start > now) await delay(start - now);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'LongFishStudentProject/1.0 (' + (process.env.IMAGE_CONTACT_EMAIL || 'Long Fish educational catalog') + ')', ...headers },
        signal: AbortSignal.timeout(20000), redirect: 'error',
      });
    } catch (error) {
      if (retry >= 2) throw error;
      await delay(1000 * 2 ** retry);
      continue;
    }
    if (response.ok) return response;
    const status = response.status;
    const retryAfter = response.headers.get('Retry-After');
    await response.body?.cancel();
    const seconds = retryAfter ? (Number.isFinite(+retryAfter) ? +retryAfter : (Date.parse(retryAfter) - Date.now()) / 1000) : 0;
    if (seconds > 60) {
      await coolDown(endpoint.hostname, seconds);
      throw new Error(endpoint.hostname + ' yêu cầu chờ ' + Math.ceil(seconds) + ' giây.');
    }
    if (![429, 500, 502, 503, 504].includes(status) || retry >= 2) {
      throw new Error(endpoint.hostname + ' HTTP ' + status);
    }
    await delay(Math.max((status === 429 ? 5000 : 1000) * 2 ** retry, seconds * 1000 || 0));
  }
}

async function jsonRequest(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const cache = 'scripts/images/.cache/' + createHash('sha256').update(url + JSON.stringify(headers)).digest('hex') + '.json';
  if (process.env.IMAGE_REFRESH_CACHE !== 'true') {
    try {
      const entry = JSON.parse(await readFile(cache, 'utf8'));
      if (entry.expires > Date.now()) return entry.data;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  }
  const data: unknown = await (await request(url, headers)).json();
  await mkdir('scripts/images/.cache', { recursive: true });
  await writeFile(cache, JSON.stringify({ expires: Date.now() + 86400000, data }));
  return data;
}

export function plain(value?: string | null) {
  return (value ?? '').replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, code) => {
    const number = Number(code);
    return number <= 0x10ffff ? String.fromCodePoint(number) : '';
  }).replace(/&(amp|quot|nbsp|apos|lt|gt);/g, (_, key) =>
    ({ amp: '&', quot: '"', nbsp: ' ', apos: "'", lt: '<', gt: '>' })[key as 'amp'] ?? '')
    .replace(/\s+/g, ' ').trim();
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function commercialLicense(name: string, url: string) {
  if (!/^(?:CC0(?: 1\.0)?|CC BY(?:-SA)? [1-4]\.\d(?: [A-Z]{2})?|public domain|Pexels License|Pixabay Content License)$/i.test(name)) return false;
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.port) return false;
    if (/^public domain$|^CC0/i.test(name)) {
      return target.hostname === 'creativecommons.org' && /^\/publicdomain\/(?:zero|mark)\/1\.0\/?$/.test(target.pathname);
    }
    const cc = name.match(/^CC BY(-SA)? ([1-4]\.\d)(?: ([A-Z]{2}))?$/i);
    if (cc) return target.hostname === 'creativecommons.org' && target.pathname.toLowerCase().replace(/\/$/, '') ===
      '/licenses/' + (cc[1] ? 'by-sa' : 'by') + '/' + cc[2] + (cc[3] ? '/' + cc[3].toLowerCase() : '');
    return name === 'Pexels License' && target.hostname === 'www.pexels.com' && target.pathname === '/license/' ||
      name === 'Pixabay Content License' && target.hostname === 'pixabay.com' && target.pathname === '/service/license-summary/';
  } catch { return false; }
}

export function score(candidate: Candidate, query: Query) {
  const { title, description, author, license, licenseUrl, width, height } = candidate;
  if (!title || !author || !/^https:\/\//.test(candidate.sourceUrl) || !commercialLicense(license, licenseUrl) || !safePhotoUrl(candidate.imageUrl) ||
      Math.min(width, height) < 600 || Math.max(width, height) / Math.min(width, height) > 2.6 ||
      /\b(?:illustration|drawing|diagram|painting|watermark|logo|icon|collage|map|poster|engraving|stamp|sketch|vector|banner|screenshot)\b/i.test(title)) return 0;
  const caption = normalize(title);
  const metadata = normalize(description);
  const best = Math.max(...query.terms.map(term => {
    const target = normalize(term);
    const words = target.split(' ').filter(word => word.length > 2);
    const present = (body: string, word: string) => (' ' + body + ' ').includes(' ' + word + ' ');
    return (caption.includes(target) ? 35 : 0) + (metadata.includes(target) ? 22 : 0) +
      words.reduce((sum, word) => sum + (present(caption, word) ? 8 : present(metadata, word) ? 4 : 0), 0);
  }));
  if (!best) return 0;
  return best + Math.min(12, Math.floor(Math.min(width, height) / 150)) +
    (width / height >= 0.85 && width / height <= 1.8 ? 6 : 0) + (/CC0|public domain/i.test(license) ? 3 : 0);
}

type Info = { url: string; descriptionurl: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value?: string }> };
type CommonsPage = { title: string; imageinfo?: Info[] };

export async function commons(params: Record<string, string>) {
  const url = commonsEndpoint + '?' + new URLSearchParams({
    action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime',
    format: 'json', formatversion: '2', ...params,
  });
  const data = await jsonRequest(url) as { error?: { code: string }; query?: { pages?: CommonsPage[] } };
  if (data.error) throw new Error('Commons ' + data.error.code);
  return (data.query?.pages ?? []).flatMap(page => {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/(?:jpeg|png|webp)$/.test(info.mime)) return [];
    const field = (key: string) => plain(info.extmetadata?.[key]?.value);
    const license = field('LicenseShortName');
    const licenseUrl = (field('LicenseUrl') || (/^Public domain$/i.test(license) ? 'https://creativecommons.org/publicdomain/mark/1.0/' : '')).replace(/^http:/, 'https:');
    const author = field('Artist') || (/^Public domain$/i.test(license) ? 'Tác giả không rõ (theo Commons)' : '');
    return [{
      source: 'commons' as const, title: page.title, description: field('ImageDescription') + ' ' + field('Categories'),
      author, license, licenseUrl, sourceUrl: info.descriptionurl, imageUrl: info.url, width: info.width, height: info.height,
    }];
  });
}

type OpenImage = { title: string | null; description?: string | null; creator?: string | null; license: string; license_version?: string; license_url?: string;
  foreign_landing_url: string; url: string; width: number; height: number; tags?: { name: string }[] };
type PexelsImage = { alt: string; photographer: string; url: string; width: number; height: number; src: { original: string } };
type PixabayImage = { tags: string; user: string; pageURL: string; largeImageURL: string; imageWidth: number; imageHeight: number };

export async function searchOpenverse(term: string, limit: number): Promise<Candidate[]> {
  const url = openverseEndpoint + '?' + new URLSearchParams({
    q: term, page_size: String(limit), license: 'cc0,pdm,by,by-sa',
    license_type: 'commercial,modification', category: 'photograph', mature: 'false',
  });
  const data = await jsonRequest(url) as { results?: OpenImage[] };
  return (data.results ?? []).map(row => ({
    source: 'openverse', title: plain(row.title), description: plain(row.description) + ' ' + (row.tags?.map(tag => tag.name).join(' ') ?? ''),
    author: plain(row.creator) || (row.license === 'pdm' ? 'Tác giả không rõ (theo Openverse)' : ''),
    license: row.license === 'pdm' ? 'Public domain' : row.license === 'cc0' ? 'CC0 1.0' : 'CC ' + row.license.toUpperCase() + ' ' + row.license_version,
    licenseUrl: row.license_url?.replace(/^http:/, 'https:') ?? '', sourceUrl: row.foreign_landing_url,
    imageUrl: row.url, width: row.width, height: row.height,
  }));
}

export async function searchStock(term: string, limit: number): Promise<Candidate[]> {
  const matches: Candidate[] = [];
  if (process.env.PEXELS_API_KEY) {
    const url = 'https://api.pexels.com/v1/search?' + new URLSearchParams({ query: term, per_page: String(limit) });
    const data = await jsonRequest(url, { Authorization: process.env.PEXELS_API_KEY }) as { photos?: PexelsImage[] };
    matches.push(...(data.photos ?? []).map(row => ({
      source: 'pexels' as const, title: plain(row.alt), description: '', author: row.photographer,
      license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/', sourceUrl: row.url,
      imageUrl: row.src.original, width: row.width, height: row.height,
    })));
  }
  if (process.env.PIXABAY_API_KEY && matches.length < limit) {
    const url = 'https://pixabay.com/api/?' + new URLSearchParams({
      key: process.env.PIXABAY_API_KEY, q: term, per_page: String(Math.max(3, limit - matches.length)), image_type: 'photo', safesearch: 'true',
    });
    const data = await jsonRequest(url) as { hits?: PixabayImage[] };
    matches.push(...(data.hits ?? []).map(row => ({
      source: 'pixabay' as const, title: row.tags, description: '', author: row.user,
      license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/', sourceUrl: row.pageURL,
      imageUrl: row.largeImageURL, width: row.imageWidth, height: row.imageHeight,
    })));
  }
  return matches.slice(0, limit);
}

