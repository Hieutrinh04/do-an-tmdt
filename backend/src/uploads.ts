import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { db } from './db';
import { HttpError } from './domain';
import { env } from './env';
import { isUploadedPhoto, uploadedImageName } from './image-path';
import { renderPhoto } from './photo-render';

const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const maxBytes = 5 * 1024 * 1024;
const directory = () => resolve(env.UPLOADS_DIR || 'data/uploads');
const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes + 1, files: 1, fields: 0, parts: 2 } }).single('image');

function signature(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
}

export const uploadAdmin = Router();
uploadAdmin.post('/', (req, res, next) => {
  multipart(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Ảnh vượt quá 5 MB.'));
    next(new HttpError(400, 'Gửi đúng một tệp qua trường image.'));
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Vui lòng chọn ảnh.');
  if (file.size > maxBytes) throw new HttpError(413, 'Ảnh vượt quá 5 MB.');
  const format = signature(file.buffer);
  if (!format || formats[file.mimetype as keyof typeof formats] !== format) throw new HttpError(415, 'Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ.');
  let main, thumb;
  try {
    const metadata = await sharp(file.buffer, { limitInputPixels: 60_000_000, failOn: 'warning' }).metadata();
    const { width, height } = metadata.autoOrient;
    if (metadata.format !== format || (metadata.pages ?? 1) > 1 || Math.min(width, height) < 4) throw new Error();
    main = await renderPhoto(file.buffer, 1200, width, height);
    thumb = await renderPhoto(file.buffer, 480, width, height);
  } catch { throw new HttpError(422, 'Ảnh hỏng, ảnh động hoặc kích thước ảnh không hợp lệ.'); }
  const id = randomUUID();
  const root = directory();
  const staging = join(root, '.' + id);
  await mkdir(root, { recursive: true });
  await mkdir(staging);
  try {
    await writeFile(join(staging, 'main.webp'), main.data);
    await writeFile(join(staging, 'thumb.webp'), thumb.data);
    await rename(staging, join(root, id));
  } catch (error) {
    await rm(join(staging, 'main.webp'), { force: true });
    await rm(join(staging, 'thumb.webp'), { force: true });
    await rmdir(staging);
    throw error;
  }
  res.status(201).json({ file: '/uploads/' + id + '.webp' });
});

export const uploadPublic = Router();
uploadPublic.get('/:file', (req, res, next) => {
  const match = uploadedImageName.exec(req.params.file);
  if (!match) return next(new HttpError(404, 'Không tìm thấy ảnh.'));
  res.sendFile(join(match[1], match[2] ? 'thumb.webp' : 'main.webp'), {
    root: directory(), immutable: true, maxAge: '30d', dotfiles: 'deny',
  }, error => {
    if (error) next((error as { status?: number }).status === 404 ? new HttpError(404, 'Không tìm thấy ảnh.') : error);
  });
});

export async function uploadedPhotoCredits() {
  const products = await db.product.findMany({ where: { isActive: true }, select: { slug: true, name: true, images: true } });
  return products.flatMap(product => Array.isArray(product.images) ? product.images.flatMap(file =>
    typeof file === 'string' && isUploadedPhoto(file)
      ? [{ slug: product.slug, file, title: product.name }] : []) : []);
}
