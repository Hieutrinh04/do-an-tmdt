import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request, safePhotoUrl } from './sources';

const inputLimit = 25_000_000;

export async function loadPhoto(url: string, refresh = false) {
  if (!safePhotoUrl(url)) throw new Error('Host ảnh ngoài danh sách hỗ trợ.');
  const cache = 'scripts/images/.cache/' + createHash('sha256').update(url).digest('hex') + '.image';
  let bytes: Buffer | undefined;
  if (!refresh) {
    try { bytes = await readFile(cache); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const downloaded = !bytes;
  if (!bytes) bytes = await download(url);
  if (bytes.length > inputLimit) throw new Error('Ảnh nguồn vượt 25 MB.');

  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!jpg && !png && !webp) throw new Error('Magic bytes không phải JPEG, PNG hoặc WebP.');
  if (downloaded) {
    await mkdir('scripts/images/.cache', { recursive: true });
    await writeFile(cache, bytes);
  }
  return bytes;
}

async function download(url: string) {
  const response = await request(url);
  if (Number(response.headers.get('content-length')) > inputLimit) {
    await response.body?.cancel();
    throw new Error('Ảnh nguồn vượt 25 MB.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Ảnh không có nội dung.');
  let length = 0;
  const pieces: Uint8Array[] = [];
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > inputLimit) throw new Error('Ảnh nguồn vượt 25 MB.');
      pieces.push(result.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(pieces);
}
