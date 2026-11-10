import { ImgHTMLAttributes, useEffect, useState } from 'react';
import { catalogFallbacks, legacyCatalogFallbacks } from '../../backend/prisma/catalog-images';
import { isUploadedPhoto, thumbnailPath } from '../../backend/src/image-path';
import { api } from './api';

type Credit = { file: string; title: string; author: string; license: string; licenseUrl: string; sourceUrl: string };
type Credits = Record<string, Credit[]>;
type UploadedCredit = { slug: string; file: string; title: string };
const suppliedCredit = 'Ảnh do Long Fish cung cấp';
let cached: Promise<Credits> | undefined;

function useCredits() {
  const [credits, setCredits] = useState<Credits>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    cached ??= fetch('/catalog/photos/credits.json', { cache: 'no-cache' }).then(response => {
      if (!response.ok) throw new Error('Không tải được danh sách nguồn ảnh.');
      return response.json() as Promise<Credits>;
    }).catch(error => { cached = undefined; throw error; });
    cached.then(result => { if (active) setCredits(result); })
      .catch(() => { if (active) setError('Không tải được danh sách nguồn ảnh. Hãy tải lại trang.'); });
    return () => { active = false; };
  }, []);
  return { credits, error };
}

export function ProductImage({ slug, source, thumbnail = false, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  slug: string; source?: string; thumbnail?: boolean;
}) {
  const fallback = catalogFallbacks[slug]?.[0] || '/catalog/betta.svg';
  const resolved = source && legacyCatalogFallbacks[slug]?.includes(source) ? fallback : source;
  const initial = thumbnail && resolved ? thumbnailPath(resolved) : resolved || fallback;
  const [failed, setFailed] = useState<string[]>([]);
  const url = failed.includes(initial) ? source && !failed.includes(source) ? source : fallback : initial;
  // Ảnh lớn của sản phẩm có sẵn bản 480 px: điện thoại tải bản nhỏ để LCP nhanh hơn.
  const responsive = !thumbnail && /^\/(catalog\/photos|uploads)\/[\w-]+\.webp$/.test(url) && !url.endsWith('-thumb.webp');
  return <span className={'product-image-wrap ' + (props.className || '')}><img {...props} className={undefined} src={url} width={1200} height={900} {...(responsive ? { srcSet: thumbnailPath(url) + ' 480w, ' + url + ' 1200w', sizes: '(max-width: 700px) 92vw, 600px' } : {})}
    fetchPriority={props.loading === 'eager' ? 'high' : props.fetchPriority} loading={props.loading || 'lazy'}
    onError={() => { if (url !== fallback) setFailed(previous => [...previous, url]); }} />
    {url.endsWith('.svg') && <small className="illustration-label">Ảnh minh họa</small>}</span>;
}

const safeLink = (url: string) => /^https:\/\//.test(url) ? url : undefined;
function Attribution({ credit }: { credit: Credit }) {
  return <>Ảnh: {credit.author} – <a href={safeLink(credit.licenseUrl)} target="_blank" rel="noopener noreferrer">{credit.license}</a>
    {' '}(<a href={safeLink(credit.sourceUrl)} target="_blank" rel="noopener noreferrer">nguồn</a>)</>;
}

export function PhotoCredit({ slug, file }: { slug: string; file: string }) {
  const { credits } = useCredits();
  if (file && isUploadedPhoto(file)) return <small className="photo-credit">{suppliedCredit}</small>;
  const credit = credits?.[slug]?.find(row => row.file === file);
  return credit ? <small className="photo-credit"><Attribution credit={credit} /></small> : null;
}

export function CreditsPage() {
  const { credits, error } = useCredits();
  const [uploaded, setUploaded] = useState<UploadedCredit[]>();
  const [uploadError, setUploadError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<UploadedCredit[]>('/photo-credits', { signal: controller.signal }).then(setUploaded)
      .catch(() => { if (!controller.signal.aborted) setUploadError(true); });
    return () => controller.abort();
  }, []);
  return <section className="shell section"><p className="eyebrow">LONG FISH</p><h1>Nguồn ảnh sản phẩm</h1>
    <p>Ảnh chụp tham khảo loài, dòng hoặc loại thiết bị. Cá và sản phẩm giao thực tế có thể khác ảnh.
      Ảnh được cắt về khung 4:3, thu nhỏ và chuyển WebP. Bản ảnh đã chỉnh giữ giấy phép của ảnh gốc.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {uploadError && <p className="error" role="alert">Không tải được nguồn ảnh do Long Fish cung cấp.</p>}
    {(!credits && !error || !uploaded && !uploadError) && <p role="status">Đang tải nguồn ảnh…</p>}
    <div className="credits-grid">{Object.entries(credits || {}).flatMap(([slug, rows]) => rows.map(row => <article className="panel stack" key={row.file}>
      <ProductImage slug={slug} source={row.file} thumbnail alt={row.title.replace(/^File:/, '')} />
      <strong>{row.title.replace(/^File:/, '')}</strong><small><Attribution credit={row} /></small>
    </article>))}{uploaded?.map((row, index) => <article className="panel stack" key={row.slug + row.file + index}>
      <ProductImage slug={row.slug} source={row.file} thumbnail alt={row.title} />
      <strong>{row.title}</strong><small>{suppliedCredit}</small>
    </article>)}</div>
    {credits && !Object.keys(credits).length && uploaded?.length === 0 && <p>Hiện cửa hàng dùng SVG tự vẽ. Ảnh chụp sẽ được ghi nguồn sau khi duyệt.</p>}
  </section>;
}

