import sharp from 'sharp';

const maxBytes = 250_000;

export async function renderPhoto(input: Buffer, width: number, sourceWidth: number, sourceHeight: number) {
  const limit = Math.min(width, sourceWidth, sourceHeight * 4 / 3);
  for (const scale of [1, 0.85, 0.7, 0.55]) {
    const w = Math.max(4, Math.floor(limit * scale / 4) * 4);
    const image = sharp(input, { limitInputPixels: 60_000_000 }).rotate()
      .resize(w, w * 3 / 4, { fit: 'cover', position: 'centre', withoutEnlargement: true });
    for (const quality of [82, 74, 66, 58]) {
      const { data, info } = await image.clone().webp({ quality }).toBuffer({ resolveWithObject: true });
      if (data.length <= maxBytes) return { data, width: info.width, height: info.height };
    }
  }
  throw new Error('Không thể đạt ngân sách 250 KB.');
}

