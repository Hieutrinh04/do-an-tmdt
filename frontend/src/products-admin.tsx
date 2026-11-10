import { FormEvent, useEffect, useState } from 'react';
import { ProductImage } from './photos';
import { api, errorText, money, Product, Variant } from './api';
import { isCatalogImage } from '../../backend/src/image-path';

type Save = (path: string, method: string, body?: unknown) => Promise<void>;
const productsPath = '/admin/products';
function data(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
const imageList = (value: string) => value.split(/\r?\n/).map(path => path.trim()).filter(Boolean);

function ProductForm({ product, save, busy, token }: { product?: Product; save: Save; busy: boolean; token: string }) {
  const [live, setLive] = useState(product?.isLiveFish ?? false);
  const [imageText, setImageText] = useState(product?.images.join('\n') ?? '');
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const images = imageList(imageText);
  const disabled = busy || uploading;
  const care = product?.careInfo;
  function moveImage(from: number, to: number) {
    const next = [...images];
    const [file] = next.splice(from, 1);
    next.splice(to, 0, file);
    setImageText(next.join('\n'));
  }
  async function upload(files: FileList | null) {
    if (disabled || !files?.length) return;
    const pending = Array.from(files);
    if (images.length + pending.length > 6) { setImageError('Mỗi sản phẩm có tối đa 6 ảnh.'); return; }
    setUploading(true);
    setImageError('');
    const errors: string[] = [];
    try {
      for (const file of pending) {
        const body = new FormData();
        body.append('image', file);
        try {
          const result = await api<{ file: string }>('/admin/uploads', { method: 'POST', body, token });
          setImageText(previous => [...imageList(previous), result.file].join('\n'));
        } catch (reason) { errors.push(file.name + ' · ' + errorText(reason)); }
      }
    } finally { setUploading(false); setImageError(errors.join('\n')); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    const fields = data(event);
    if (disabled) return;
    if (!images.length || images.length > 6 || images.some(path => !isCatalogImage(path))) {
      setImageError('Thêm từ 1 đến 6 ảnh hợp lệ rồi lưu sản phẩm.');
      return;
    }
    setImageError('');
    const form = event.currentTarget;
    await save(product ? productsPath + '/' + product.id : productsPath, product ? 'PATCH' : 'POST', {
      name: fields.get('name'), slug: fields.get('slug'), description: fields.get('description'), category: fields.get('category'),
      price: Number(fields.get('price')), isActive: fields.has('isActive'), isLiveFish: live,
      salePrice: fields.get('salePrice') ? Number(fields.get('salePrice')) : null,
      saleStartsAt: fields.get('saleStartsAt') ? new Date(String(fields.get('saleStartsAt'))).toISOString() : null,
      saleEndsAt: fields.get('saleEndsAt') ? new Date(String(fields.get('saleEndsAt'))).toISOString() : null,
      careInfo: live ? {
        ...Object.fromEntries(['scientificName','temperature','ph','temperament','difficulty','food'].map(key => [key, fields.get(key)])),
        adultCm: Number(fields.get('adultCm')), minTankLiters: Number(fields.get('minTankLiters')), source: fields.get('source') || undefined,
        community: fields.has('community'), algaeEater: fields.has('algaeEater'), compact: fields.has('compact'),
      } : undefined,
      images,
    });
    if (product) {
      // Sản phẩm mua kèm (CROSSSELL) và đề xuất thay thế (UPSELL): mỗi dòng hoặc mỗi dấu phẩy là một slug.
      const list = (key: string) => String(fields.get(key) || '').split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
      await save(productsPath + '/' + product.id + '/links', 'PUT', { CROSSSELL: list('crossSell'), UPSELL: list('upSell') });
    }
    if (!product) { form.reset(); setLive(false); setImageText(''); }
  }
  const localInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    const pad = (number: number) => String(number).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  };
  const linkedSlugs = (type: string) => (product?.links || []).filter(link => link.type === type).map(link => link.linked.slug).join(', ');
  return <form className="form-grid" onSubmit={event => void submit(event).catch(() => {})}>
    <label>Tên sản phẩm<input name="name" required maxLength={120} defaultValue={product?.name} /></label>
    <label>Đường dẫn (slug)<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100} defaultValue={product?.slug} /></label>
    <label>Danh mục<input name="category" required maxLength={80} defaultValue={product?.category} /></label>
    <label>Giá gốc (₫)<input name="price" type="number" min={0} max={20000000} required defaultValue={product?.price} /></label>
    <fieldset className="full panel form-grid"><legend>Khuyến mãi (để trống nếu không giảm giá)</legend>
      <label>Giá khuyến mãi (₫, nhỏ hơn giá gốc)<input name="salePrice" type="number" min={0} max={20000000} defaultValue={product?.salePrice ?? ''} /></label>
      <label>Bắt đầu (không bắt buộc)<input name="saleStartsAt" type="datetime-local" defaultValue={localInput(product?.saleStartsAt)} /></label>
      <label>Kết thúc (không bắt buộc)<input name="saleEndsAt" type="datetime-local" defaultValue={localInput(product?.saleEndsAt)} /></label>
    </fieldset>
    {product && <fieldset className="full panel form-grid"><legend>Sản phẩm liên quan</legend>
      <label>Mua kèm (slug, cách nhau bằng dấu phẩy)<textarea name="crossSell" rows={2} defaultValue={linkedSlugs('CROSSSELL')} /></label>
      <label>Đề xuất thay thế / nâng cấp (slug)<textarea name="upSell" rows={2} defaultValue={linkedSlugs('UPSELL')} /></label>
    </fieldset>}
    <label className="full">Mô tả<textarea name="description" required maxLength={1500} defaultValue={product?.description} /></label>
    <fieldset className="full panel stack"><legend>Ảnh sản phẩm</legend>
      <label className="upload-drop" onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault(); void upload(event.dataTransfer.files);
      }}>Tải ảnh lên hoặc kéo thả vào đây
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled}
          onChange={event => { void upload(event.currentTarget.files); event.currentTarget.value = ''; }} />
        <small>JPEG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh. Lưu sản phẩm sau khi chọn ảnh chính.</small>
      </label>
      {uploading && <p role="status">Đang tải ảnh…</p>}
      {imageError && <p className="error" role="alert">{imageError}</p>}
      <label>Địa chỉ ảnh HTTPS hoặc nội bộ (mỗi dòng một ảnh)
        <textarea value={imageText} disabled={disabled} onChange={event => setImageText(event.target.value)} />
      </label>
      {images.length > 0 && <ol className="stack">{images.map((file, index) => <li className="image-order" key={file + index}>
        {isCatalogImage(file) && <ProductImage className="thumb" slug={product?.slug || ''} source={file} thumbnail alt="" />}
        <span>{index === 0 ? 'Ảnh chính' : 'Ảnh ' + (index + 1)}</span>
        <button className="outline" type="button" disabled={disabled || index === 0} onClick={() => moveImage(index, 0)}>Đặt làm ảnh chính</button>
        <button className="outline" type="button" disabled={disabled || index === 0} onClick={() => moveImage(index, index - 1)}>Lên</button>
        <button className="outline" type="button" disabled={disabled || index === images.length - 1} onClick={() => moveImage(index, index + 1)}>Xuống</button>
        <button className="outline" type="button" disabled={disabled} onClick={() => setImageText(images.filter((_, i) => i !== index).join('\n'))}>Xóa khỏi sản phẩm</button>
      </li>)}</ol>}
    </fieldset>
    <label className="radio"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Cá sống</label>
    {live && <fieldset className="full panel form-grid"><legend>Thông số nuôi tham khảo</legend>
      <label>Tên khoa học<input name="scientificName" required defaultValue={care?.scientificName} /></label>
      <label>Cỡ trưởng thành (cm)<input name="adultCm" type="number" step="0.1" min="0.1" required defaultValue={care?.adultCm} /></label>
      <label>Nhiệt độ<input name="temperature" required defaultValue={care?.temperature} /></label>
      <label>pH<input name="ph" required defaultValue={care?.ph} /></label>
      <label>Bể tham khảo (L)<input name="minTankLiters" type="number" min="1" required defaultValue={care?.minTankLiters} /></label>
      <label>Độ khó<select name="difficulty" defaultValue={care?.difficulty || 'Dễ'}>{['Dễ','Trung bình','Nâng cao'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Tính cách<textarea name="temperament" required defaultValue={care?.temperament} /></label>
      <label>Thức ăn<textarea name="food" required defaultValue={care?.food} /></label>
      <label className="full">Nguồn tham khảo HTTPS<input name="source" type="url" defaultValue={care?.source} /></label>
      <label className="radio"><input type="checkbox" name="community" defaultChecked={care?.community} /> Có thể nuôi chung có điều kiện</label>
      <label className="radio"><input type="checkbox" name="algaeEater" defaultChecked={care?.algaeEater} /> Có ăn tảo hoặc rêu</label>
      <label className="radio"><input type="checkbox" name="compact" defaultChecked={care?.compact} /> Phù hợp bể nhỏ đủ dung tích</label>
    </fieldset>}
    <label className="radio"><input name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} /> Hiển thị cửa hàng</label>
    <div className="flex flex-wrap gap-2"><button className="button" disabled={disabled}>{product ? 'Lưu sản phẩm' : 'Thêm sản phẩm'}</button>
      {product?.isActive && <button type="button" className="outline" disabled={disabled} onClick={() => void save(productsPath + '/' + product.id, 'DELETE').catch(() => {})}>Ẩn</button>}</div>
  </form>;
}
function VariantForm({ product, variant, save, busy }: { product: Product; variant?: Variant; save: Save; busy: boolean }) {
  const path = productsPath + '/' + product.id + '/variants' + (variant ? '/' + variant.id : '');
  async function submit(event: FormEvent<HTMLFormElement>) {
    const fields = data(event);
    const form = event.currentTarget;
    await save(path, variant ? 'PATCH' : 'POST', {
      color: fields.get('color'), size: fields.get('size'), gender: fields.get('gender'), unit: fields.get('unit'), minQty: Number(fields.get('minQty')), sku: fields.get('sku'), stock: Number(fields.get('stock')), lowStockThreshold: Number(fields.get('lowStockThreshold')),
      priceOverride: fields.get('priceOverride') ? Number(fields.get('priceOverride')) : null, isActive: fields.has('isActive'),
    });
    if (!variant) form.reset();
  }
  return <form className="form-grid" onSubmit={event => void submit(event).catch(() => {})}>
    <label>SKU<input name="sku" required maxLength={80} defaultValue={variant?.sku} /></label>
    <label>Dòng / màu<input name="color" required maxLength={70} defaultValue={variant?.color} /></label>
    <label>Cỡ / quy cách<input name="size" required maxLength={30} defaultValue={variant?.size} /></label>
    <label>Giới tính<select name="gender" defaultValue={variant?.gender || 'Không phân biệt'}>{['Không phân biệt','Đực','Cái','Cặp'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Đơn vị<select name="unit" defaultValue={variant?.unit || (product.isLiveFish ? 'con' : 'cái')}>{['con','cặp','bộ','gói','cái'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Số lượng tối thiểu<input name="minQty" type="number" min={1} max={99} required defaultValue={variant?.minQty || 1} /></label>
    <label>Tồn kho<input name="stock" required type="number" min={0} max={1000000} defaultValue={variant?.stock} /></label>
      <label>Ngưỡng cảnh báo tồn thấp<input name="lowStockThreshold" required type="number" min={0} max={1000000} defaultValue={variant?.lowStockThreshold ?? 5}/></label>
    <label>Giá riêng (₫)<input name="priceOverride" type="number" min={0} max={20000000} defaultValue={variant?.priceOverride ?? ''} /></label>
    <label className="radio"><input name="isActive" type="checkbox" defaultChecked={variant?.isActive ?? true} /> Đang bán</label>
    <div className="full flex flex-wrap gap-2"><button className="button" disabled={busy}>{variant ? 'Lưu phân loại' : 'Thêm phân loại'}</button>
      {variant?.isActive && <button type="button" className="outline" disabled={busy} onClick={() => void save(path, 'DELETE').catch(() => {})}>Ngừng bán</button>}</div>
  </form>;
}

export function ProductsAdmin({ token }: { token: string }) {
  const [rows, setRows] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<Product[]>(productsPath, { token, signal: controller.signal }).then(setRows)
      .catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [token]);
  const save: Save = async (path, method, body) => {
    setBusy(true); setError(''); setStatus('');
    try {
      await api(path, { token, method, body });
      setRows(await api<Product[]>(productsPath, { token }));
      setStatus('Đã lưu thay đổi.');
    } catch (reason) { setError(errorText(reason)); throw reason; }
    finally { setBusy(false); }
  };
  return <div className="stack"><h2>Sản phẩm và tồn kho</h2>
    {error && <p role="alert" className="error">{error}</p>}{status && <p role="status">{status}</p>}
    <details className="panel admin-list"><summary>Thêm sản phẩm</summary><ProductForm save={save} busy={busy} token={token} /></details>
    {rows.map(product => <details key={product.id} className="panel admin-list">
      <summary><ProductImage className="thumb inline-block mr-2 align-middle" slug={product.slug} source={product.images[0]} thumbnail alt="" />{product.name} · {money(product.price)} {product.isActive ? '' : '· Đã ẩn'}
        {product.variants.some(variant => variant.isActive && variant.stock <= (variant.lowStockThreshold ?? 5)) && <span className="badge muted ml-2">Tồn thấp</span>}
      </summary>
      <ProductForm key={JSON.stringify({ ...product, variants: [] })} product={product} save={save} busy={busy} token={token} />
      <h3 className="mt-3">Phân loại</h3>
      {product.variants.map(variant => <details className="panel mb-2" key={variant.id}>
          <summary>{variant.color} / {variant.size} / {variant.gender} · Còn {variant.stock} {variant.unit} {variant.isActive ? '' : '· Đã ngừng bán'} {variant.isActive&&variant.stock<=(variant.lowStockThreshold??5)&&<span className="badge muted">Tồn thấp · ngưỡng {variant.lowStockThreshold??5}</span>}</summary>
        <VariantForm key={JSON.stringify(variant)} product={product} variant={variant} save={save} busy={busy} />
      </details>)}
      <details className="panel"><summary>Thêm phân loại</summary><VariantForm product={product} save={save} busy={busy} /></details>
    </details>)}
  </div>;
}

