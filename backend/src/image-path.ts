export const uploadedImageName = /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(-thumb)?\.webp$/;

export function isUploadedPhoto(value: string) {
  const match = value.startsWith('/uploads/') ? uploadedImageName.exec(value.slice('/uploads/'.length)) : null;
  return !!match && !match[2];
}

export function isCatalogImage(value: string) {
  if (isUploadedPhoto(value)) return true;
  if (/^\/catalog\/(?:[\w-]+\.(?:svg|png|jpe?g|webp)|photos\/[a-z0-9]+(?:-[a-z0-9]+)*-[1-3]\.webp)$/i.test(value)) return true;
  if (!/^https:\/\/[^\s\\]+$/.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function thumbnailPath(path: string) {
  return (isUploadedPhoto(path) || /^\/catalog\/photos\/[a-z0-9]+(?:-[a-z0-9]+)*-[1-3]\.webp$/.test(path))
    ? path.replace(/\.webp$/, '-thumb.webp') : path;
}

