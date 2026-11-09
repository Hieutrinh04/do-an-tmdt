import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { renderPhoto } from '../../backend/src/photo-render';
import { fish, supplies } from '../../backend/prisma/aquatic-catalog';
import { options } from './options';
import { loadPhoto } from './download';
import { Candidate, Query, commons, score, searchOpenverse, searchStock } from './sources';

type Credit = Pick<Candidate, 'title' | 'author' | 'license' | 'licenseUrl' | 'sourceUrl' | 'source'> & {
  file: string; hash: string; width: number; height: number;
};
const dir = 'frontend/public/catalog/photos';
const creditsFile = join(dir, 'credits.json');
const reportFile = 'docs/images-todo.md';
const manifestFile = 'backend/prisma/photo-manifest.ts';
const lockPath = 'scripts/images/.fetch.lock';

async function json<T>(path: string, fallback?: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}

async function atomic(path: string, value: Buffer | string) {
  const tmp = path + '.tmp';
  await writeFile(tmp, value);
  await rename(tmp, path);
}

async function candidates(query: Query) {
  const chosen = new Map<string, Candidate>();
  const warnings: string[] = [];
  const add = async (lookup: () => Promise<Candidate[]>) => {
    try {
      for (const item of await lookup()) {
        if (chosen.size >= 15) break;
        if (score(item, query) && !chosen.has(item.sourceUrl)) chosen.set(item.sourceUrl, item);
      }
    } catch (error) { warnings.push(error instanceof Error ? error.message : 'Không truy cập được nguồn.'); }
  };

  const titles = query.approved.filter(value => /^File:/i.test(value));
  if (titles.length) await add(() => commons({ titles: titles.join('|'), redirects: '1' }));
  const openverseTerm = query.openverseTerm || query.terms[0];
  if (query.approved.some(value => value.startsWith('https://'))) {
    await add(async () => (await searchOpenverse(openverseTerm, 15)).filter(row => query.approved.includes(row.sourceUrl)));
  }
  for (const term of query.terms.slice(0, 2)) {
    const limit = Math.min(8, 15 - chosen.size);
    if (limit <= 0) break;
    await add(() => commons({ generator: 'search', gsrnamespace: '6', gsrlimit: String(limit), gsrsearch: term + ' filetype:bitmap' }));
  }
  if (chosen.size < 15 && (!query.approved.length || titles.length !== query.approved.length)) {
    await add(() => searchOpenverse(openverseTerm, 15 - chosen.size));
  }
  if (chosen.size < 15 && (process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY) &&
      (!query.approved.length || titles.length !== query.approved.length)) {
    await add(() => searchStock(query.terms[0], 15 - chosen.size));
  }
  return { list: [...chosen.values()].sort((a, b) => score(b, query) - score(a, query)), warnings };
}

async function main() {
  const args = options();
  process.env.IMAGE_REFRESH_CACHE = args.refresh ? 'true' : 'false';
  if (process.env.UNSPLASH_ACCESS_KEY) console.warn('Bỏ qua Unsplash: chế độ lưu ảnh cục bộ này chưa có thỏa thuận hosting riêng với Unsplash.');
  if (args.docker) throw new Error('--docker chỉ dùng cho images:apply.');
  const catalog = [...fish, ...supplies];
  const slugs: string[] = catalog.map(row => row[1]);
  const queries = await json<Record<string, Query>>('scripts/images/queries.json');
  const credits = await json<Record<string, Credit[]>>(creditsFile, {});
  const outcomes = await json<Record<string, string>>(join('scripts/images', 'review-status.json'), {});
  if (args.only && !slugs.includes(args.only)) throw new Error('Không tìm thấy slug ' + args.only);
  if (!args['dry-run']) await mkdir(dir, { recursive: true });
  const selected = args.only ? [args.only] : slugs;
  for (const slug of selected) {
    const query = queries[slug];
    if (!query?.terms.length) throw new Error('Thiếu từ khóa của ' + slug);
    const existing = credits[slug] ?? [];
    const reusable = !args['dry-run'] && !args.refresh && existing.length > 0 &&
        await Promise.all(existing.flatMap(row => [row.file, row.file.replace(/\.webp$/, '-thumb.webp')])
          .map(file => readFile(join(dir, file.split('/').at(-1)!)).then(() => true, () => false))).then(values => values.every(Boolean));
    const approved = reusable ? query.approved.filter(value => !existing.some(row => row.title === value || row.sourceUrl === value)) : query.approved;
    if (reusable && (!approved.length || existing.length >= 3)) {
      console.log(slug + ': đã có ' + existing.length + ' ảnh, bỏ qua.');
      continue;
    }
    const { list, warnings } = await candidates(query);
    console.log(slug + ': ' + list.length + ' ứng viên');
    for (const item of list) console.log('  ' + score(item, query) + ' | ' + item.license + ' | ' + item.title + ' | ' + item.sourceUrl);
    if (warnings.length) console.warn('  ' + [...new Set(warnings)].join('; '));
    if (args['dry-run']) continue;
    const next: Credit[] = reusable ? [...existing] : [];
    const verified = approved.map(value => list.find(row => row.title === value || row.sourceUrl === value))
      .filter((item): item is Candidate => item !== undefined).slice(0, 3 - next.length);
    const used = new Set(Object.entries(credits).filter(([key]) => key !== slug || reusable)
      .flatMap(([, rows]) => rows.map(row => row.hash)));
    const files: { path: string; data: Buffer }[] = [];
    const failures = new Set<string>();
    for (const item of verified) {
      try {
        const input = await loadPhoto(item.imageUrl, args.refresh);
        const meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
        if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 600 ||
            Math.max(meta.width, meta.height) / Math.min(meta.width, meta.height) > 2.6 || (meta.pages ?? 1) > 1) {
          throw new Error('Ảnh tải về không đạt kích thước hoặc tỉ lệ.');
        }
        const hash = createHash('sha256').update(input).digest('hex');
        if (used.has(hash)) continue;
        const { width, height } = meta.autoOrient;
        const main = await renderPhoto(input, 1200, width, height);
        const thumbnail = await renderPhoto(input, 480, width, height);
        const name = slug + '-' + (next.length + 1);
        files.push({ path: join(dir, name + '.webp'), data: main.data },
          { path: join(dir, name + '-thumb.webp'), data: thumbnail.data });
        const { title, author, license, licenseUrl, sourceUrl, source } = item;
        next.push({ file: '/catalog/photos/' + name + '.webp', hash, title, author, license, licenseUrl,
          sourceUrl, source, width: main.width, height: main.height });
        used.add(hash);
      } catch (error) {
        const message = (error as Error).message;
        failures.add(message);
        console.warn(slug + ': bỏ qua ' + item.title + ' · ' + message);
      }
    }
    if (next.length && (next.length >= existing.length || next.length === query.approved.length)) {
      for (const file of files) await atomic(file.path, file.data);
      credits[slug] = next;
    } else if (existing.length) {
      console.warn(slug + ': giữ bộ ảnh cũ vì lượt tải chưa đủ ảnh.');
    }
    const count = credits[slug]?.length ?? 0;
    outcomes[slug] = count >= 2 ? '' : count === 1
      ? 'Đã xác minh 1 ảnh, cần thêm góc chụp hoặc ngữ cảnh khác.'
      : query.approved.length ? 'Ứng viên đã duyệt chưa tải được hoặc không còn đạt điều kiện.' +
        ([...failures].some(message => /yêu cầu chờ|HTTP 429/.test(message)) ? ' Máy chủ ảnh đang giới hạn lượt tải.' : '') :
        'Chưa có ảnh được xác minh đúng sản phẩm, giấy phép và kích thước.';
    await atomic(creditsFile, JSON.stringify(credits, null, 2) + '\n');
    await atomic(manifestFile, '// Sinh từ credits.json bằng npm run images:fetch.\nexport const catalogPhotos: Record<string, string[]> = ' +
      JSON.stringify(Object.fromEntries(Object.entries(credits).map(([key, rows]) => [key, rows.map(row => row.file)])), null, 2) + ';\n');
    await atomic(join('scripts/images', 'review-status.json'), JSON.stringify(outcomes, null, 2) + '\n');
  }
  if (args['dry-run']) return;
  const count = slugs.filter(slug => credits[slug]?.length).length;
  const lines = [
    '# Ảnh Long Fish cần bổ sung', '',
    count + '/' + slugs.length + ' sản phẩm có ảnh chụp đã xác minh. Các sản phẩm không có ảnh thật tiếp tục dùng SVG.', '',
    '| Sản phẩm | Số ảnh | Lý do | Từ khóa tìm tiếp | Ảnh nên chụp thế nào |', '|---|---:|---|---|---|',
    ...catalog.filter(row => (credits[row[1]]?.length ?? 0) < 2).map(row =>
      '| ' + row[0] + ' | ' + (credits[row[1]]?.length ?? 0) + ' | ' +
      (outcomes[row[1]] || 'Chưa được duyệt.') + (queries[row[1]].reviewNote ? ' ' + queries[row[1]].reviewNote : '') +
      ' | ' + queries[row[1]].terms[0].replaceAll('|', ' ') + ' | ' +
      (queries[row[1]].photoAdvice || 'Chụp thêm góc ngang hoặc nghiêng trong bể sạch, chủ thể rõ, cạnh ngắn từ 600 px.') + ' |'), '',
    'Duyệt ảnh thật và giấy phép trước khi thêm tên File: của Commons hoặc URL trang nguồn vào approved trong scripts/images/queries.json.', '',
  ];
  await atomic(reportFile, lines.join('\n'));
}

async function run() {
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Một lượt lấy ảnh khác đang chạy. Nếu lượt trước bị ngắt, xóa scripts/images/.fetch.lock rồi thử lại.');
    throw error;
  }
  try { await lock.writeFile(String(process.pid)); await main(); }
  finally { await lock.close(); await unlink(lockPath); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });

