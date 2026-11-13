import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Drawer, Empty, Icon } from './admin-tools';
import { ProductImage } from './photos';
import { api, errorText, money, Product, Variant } from './api';
import { isCatalogImage } from '../../backend/src/image-path';

type Save = (path: string, method: string, body?: unknown, done?: string) => Promise<void>;
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
      await save(productsPath + '/' + product.id + '/links', 'PUT', { CROSSSELL: list('crossSell'), UPSELL: list('upSell') }, 'Đã lưu sản phẩm.');
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
    <fieldset className="full ad-fieldset form-grid"><legend>Khuyến mãi (để trống nếu không giảm giá)</legend>
      <label>Giá khuyến mãi (₫, nhỏ hơn giá gốc)<input name="salePrice" type="number" min={0} max={20000000} defaultValue={product?.salePrice ?? ''} /></label>
      <label>Bắt đầu (không bắt buộc)<input name="saleStartsAt" type="datetime-local" defaultValue={localInput(product?.saleStartsAt)} /></label>
      <label>Kết thúc (không bắt buộc)<input name="saleEndsAt" type="datetime-local" defaultValue={localInput(product?.saleEndsAt)} /></label>
    </fieldset>
    {product && <fieldset className="full ad-fieldset form-grid"><legend>Sản phẩm liên quan</legend>
      <label>Mua kèm (slug, cách nhau bằng dấu phẩy)<textarea name="crossSell" rows={2} defaultValue={linkedSlugs('CROSSSELL')} /></label>
      <label>Đề xuất thay thế / nâng cấp (slug)<textarea name="upSell" rows={2} defaultValue={linkedSlugs('UPSELL')} /></label>
    </fieldset>}
    <label className="full">Mô tả<textarea name="description" required maxLength={1500} defaultValue={product?.description} /></label>
    <fieldset className="full ad-fieldset stack"><legend>Ảnh sản phẩm</legend>
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
        <button className="ad-btn ad-btn--ghost ad-btn--sm" type="button" disabled={disabled || index === 0} onClick={() => moveImage(index, 0)}>Đặt làm ảnh chính</button>
        <button className="ad-btn ad-btn--ghost ad-btn--sm" type="button" disabled={disabled || index === 0} onClick={() => moveImage(index, index - 1)}>Lên</button>
        <button className="ad-btn ad-btn--ghost ad-btn--sm" type="button" disabled={disabled || index === images.length - 1} onClick={() => moveImage(index, index + 1)}>Xuống</button>
        <button className="ad-btn ad-btn--ghost ad-btn--sm" type="button" disabled={disabled} onClick={() => setImageText(images.filter((_, i) => i !== index).join('\n'))}>Xóa khỏi sản phẩm</button>
      </li>)}</ol>}
    </fieldset>
    <label className="ad-check"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Cá sống</label>
    {live && <fieldset className="full ad-fieldset form-grid"><legend>Thông số nuôi tham khảo</legend>
      <label>Tên khoa học<input name="scientificName" required defaultValue={care?.scientificName} /></label>
      <label>Cỡ trưởng thành (cm)<input name="adultCm" type="number" step="0.1" min="0.1" required defaultValue={care?.adultCm} /></label>
      <label>Nhiệt độ<input name="temperature" required defaultValue={care?.temperature} /></label>
      <label>pH<input name="ph" required defaultValue={care?.ph} /></label>
      <label>Bể tham khảo (L)<input name="minTankLiters" type="number" min="1" required defaultValue={care?.minTankLiters} /></label>
      <label>Độ khó<select name="difficulty" defaultValue={care?.difficulty || 'Dễ'}>{['Dễ','Trung bình','Nâng cao'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Tính cách<textarea name="temperament" required defaultValue={care?.temperament} /></label>
      <label>Thức ăn<textarea name="food" required defaultValue={care?.food} /></label>
      <label className="full">Nguồn tham khảo HTTPS<input name="source" type="url" defaultValue={care?.source} /></label>
      <label className="ad-check"><input type="checkbox" name="community" defaultChecked={care?.community} /> Có thể nuôi chung có điều kiện</label>
      <label className="ad-check"><input type="checkbox" name="algaeEater" defaultChecked={care?.algaeEater} /> Có ăn tảo hoặc rêu</label>
      <label className="ad-check"><input type="checkbox" name="compact" defaultChecked={care?.compact} /> Phù hợp bể nhỏ đủ dung tích</label>
    </fieldset>}
    <label className="ad-check"><input name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} /> Hiển thị cửa hàng</label>
    <div className="full ad-row ad-sticky"><button className="ad-btn ad-btn--primary" disabled={disabled}>{product ? 'Lưu sản phẩm' : 'Thêm sản phẩm'}</button>
      {product && (product.isActive
        ? <button type="button" className="ad-btn ad-btn--ghost ad-btn--sm" disabled={disabled} onClick={() => void save(productsPath + '/' + product.id, 'DELETE', undefined, 'Đã ẩn sản phẩm khỏi cửa hàng.').catch(() => {})}>Ẩn khỏi cửa hàng</button>
        : <button type="button" className="ad-btn ad-btn--ghost ad-btn--sm" disabled={disabled} onClick={() => void save(productsPath + '/' + product.id, 'PATCH', { isActive: true }, 'Đã hiện lại sản phẩm trên cửa hàng.').catch(() => {})}>Hiện lại trên cửa hàng</button>)}
      {product && <button type="button" className="ad-btn ad-btn--danger ad-btn--sm" disabled={disabled} onClick={() => {
        if (window.confirm('Xóa vĩnh viễn "' + product.name + '" cùng toàn bộ phân loại? Không thể hoàn tác. Sản phẩm đã có đơn hàng thì chỉ ẩn được.'))
          void save(productsPath + '/' + product.id + '?permanent=1', 'DELETE', undefined, 'Đã xóa sản phẩm "' + product.name + '".').catch(() => {});
      }}>Xóa vĩnh viễn</button>}</div>
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
    }, variant ? 'Đã lưu phân loại ' + fields.get('sku') + '.' : 'Đã thêm phân loại ' + fields.get('sku') + '.');
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
    <label className="ad-check"><input name="isActive" type="checkbox" defaultChecked={variant?.isActive ?? true} /> Đang bán</label>
    <div className="full ad-row"><button className="ad-btn ad-btn--primary" disabled={busy}>{variant ? 'Lưu phân loại' : 'Thêm phân loại'}</button>
      {variant && (variant.isActive
        ? <button type="button" className="ad-btn ad-btn--ghost ad-btn--sm" disabled={busy} onClick={() => void save(path, 'DELETE', undefined, 'Đã ngừng bán ' + variant.sku + '.').catch(() => {})}>Ngừng bán</button>
        : <button type="button" className="ad-btn ad-btn--ghost ad-btn--sm" disabled={busy} onClick={() => void save(path, 'PATCH', { isActive: true }, 'Đã mở bán lại ' + variant.sku + '.').catch(() => {})}>Bán lại</button>)}
      {variant && <button type="button" className="ad-btn ad-btn--danger ad-btn--sm" disabled={busy} onClick={() => {
        if (window.confirm('Xóa vĩnh viễn phân loại ' + variant.sku + '? Phân loại đã có đơn hàng thì chỉ ngừng bán được.'))
          void save(path + '?permanent=1', 'DELETE', undefined, 'Đã xóa phân loại ' + variant.sku + '.').catch(() => {});
      }}>Xóa phân loại</button>}</div>
  </form>;
}

const low = (variant: Variant) => variant.isActive && variant.stock <= (variant.lowStockThreshold ?? 5);
const saleActive = (product: Product, now = Date.now()) => product.salePrice != null &&
  (!product.saleStartsAt || Date.parse(product.saleStartsAt) <= now) && (!product.saleEndsAt || Date.parse(product.saleEndsAt) > now);

/** Chỉnh nhanh tồn kho từng phân loại ngay trong bảng. */
function StockCell({ product, variant, save, busy }: { product: Product; variant: Variant; save: Save; busy: boolean }) {
  const [value, setValue] = useState(String(variant.stock));
  useEffect(() => setValue(String(variant.stock)), [variant.stock]);
  const changed = value !== '' && Number(value) !== variant.stock;
  return <form className="ad-stockedit" onSubmit={event => { event.preventDefault(); if (changed) void save(productsPath + '/' + product.id + '/variants/' + variant.id, 'PATCH', { stock: Number(value) }, 'Đã cập nhật tồn kho ' + variant.sku + ' = ' + value + '.').catch(() => {}); }}>
    <label className="sr-only" htmlFor={'stock-' + variant.id}>Tồn kho {variant.sku}</label>
    <input id={'stock-' + variant.id} type="number" min={0} max={1000000} value={value} onChange={event => setValue(event.target.value)} />
    <button className="ad-btn ad-btn--sm" disabled={busy || !changed}>Lưu</button>
  </form>;
}

function ProductDrawer({ product, save, busy, token, onClose, notice }: { product: Product; save: Save; busy: boolean; token: string; onClose: () => void; notice: ReactNode }) {
  const [tab, setTab] = useState<'stock' | 'info'>('stock');
  const [editing, setEditing] = useState<string>();
  const editVariant = product.variants.find(row => row.id === editing);
  return <Drawer wide title={product.name} subtitle={<><span>{product.category}</span><span>/{product.slug}</span>{!product.isActive && <span className="ad-flag">Đang ẩn</span>}
    <a className="ad-link" href={'/san-pham/' + product.slug} target="_blank" rel="noreferrer">Xem trên cửa hàng ↗</a></>} onClose={onClose}>
    {notice}
    <div className="ad-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'stock'} className={tab === 'stock' ? 'is-on' : ''} onClick={() => setTab('stock')}>Phân loại & tồn kho<i>{product.variants.length}</i></button>
      <button role="tab" aria-selected={tab === 'info'} className={tab === 'info' ? 'is-on' : ''} onClick={() => setTab('info')}>Thông tin, giá, ảnh</button>
    </div>
    {tab === 'info' ? <ProductForm key={JSON.stringify({ ...product, variants: [] })} product={product} save={save} busy={busy} token={token} /> : <>
      <div className="ad-table-wrap"><table className="ad-table">
        <thead><tr><th>Phân loại</th><th>SKU</th><th className="num">Giá</th><th>Tồn kho</th><th><span className="sr-only">Sửa</span></th></tr></thead>
        <tbody>{product.variants.map(variant => <tr key={variant.id} className={variant.isActive ? '' : 'is-off'}>
          <td><strong>{variant.color}</strong><small>{variant.size} · {variant.gender}{variant.isActive ? '' : ' · ngừng bán'}</small></td>
          <td><code>{variant.sku}</code></td>
          <td className="num">{money(variant.priceOverride ?? product.price)}</td>
          <td><StockCell product={product} variant={variant} save={save} busy={busy} />
            {low(variant) && <small className={variant.stock === 0 ? 'ad-late' : 'ad-warn'}>{variant.stock === 0 ? 'Hết hàng' : 'Dưới ngưỡng ' + (variant.lowStockThreshold ?? 5)}</small>}</td>
          <td className="act"><button className="ad-btn ad-btn--ghost ad-btn--sm" onClick={() => setEditing(editing === variant.id ? undefined : variant.id)} aria-expanded={editing === variant.id}>{editing === variant.id ? 'Đóng' : 'Sửa'}</button></td>
        </tr>)}</tbody></table></div>
      {editVariant && <section className="ad-block"><h3>Sửa phân loại {editVariant.sku}</h3>
        <VariantForm key={JSON.stringify(editVariant)} product={product} variant={editVariant} save={save} busy={busy} /></section>}
      <details className="ad-block ad-more"><summary>+ Thêm phân loại</summary><VariantForm product={product} save={save} busy={busy} /></details>
    </>}
  </Drawer>;
}

const quick: [string, string][] = [['', 'Tất cả'], ['live', 'Cá sống'], ['sale', 'Đang giảm giá'], ['hidden', 'Đang ẩn']];

export function ProductsAdmin({ token, onChange }: { token: string; onChange?: () => void }) {
  const [rows, setRows] = useState<Product[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '', category = params.get('category') || '', stock = params.get('stock') || '', show = params.get('show') || '';
  useEffect(() => {
    const controller = new AbortController();
    api<Product[]>(productsPath, { token, signal: controller.signal }).then(setRows)
      .catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [token]);
  useEffect(() => { if (!status) return; const timer = window.setTimeout(() => setStatus(''), 3500); return () => window.clearTimeout(timer); }, [status]);
  const save: Save = async (path, method, body, done) => {
    setBusy(true); setError(''); setStatus('');
    try {
      await api(path, { token, method, body });
      setRows(await api<Product[]>(productsPath, { token }));
      if (done) setStatus(done);
      onChange?.();
    } catch (reason) { setError(errorText(reason)); throw reason; }
    finally { setBusy(false); }
  };
  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const categories = useMemo(() => [...new Set((rows ?? []).map(row => row.category))].sort(), [rows]);
  const needle = q.toLowerCase();
  const list = (rows ?? []).filter(row => (!needle || [row.name, row.slug, ...row.variants.map(v => v.sku)].some(value => value.toLowerCase().includes(needle)))
    && (!category || row.category === category) && (!stock || (row.isActive && row.variants.some(low)))
    && (show === 'hidden' ? !row.isActive : show === 'sale' ? saleActive(row) : show === 'live' ? row.isLiveFish : true))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const lowCount = (rows ?? []).filter(row => row.isActive && row.variants.some(low)).length;
  const open = rows?.find(row => row.id === openId);
  // Thông báo hiện ngay trong ngăn kéo đang mở (trước đây nằm phía sau ngăn kéo nên bị che).
  const notice = (error || status) ? <p role={error ? 'alert' : 'status'} className={'ad-notice ' + (error ? 'is-error' : 'is-ok')}>{error || status}</p> : null;
  const openProduct = (productId: string) => { setError(''); setStatus(''); setOpenId(productId); };
  return <div className="ad-page">
    <div className="ad-head">
      <div><h1>Sản phẩm & kho</h1><p className="ad-muted">{rows ? rows.length + ' sản phẩm · ' + rows.reduce((sum, row) => sum + row.variants.length, 0) + ' phân loại · ' + lowCount + ' sản phẩm có phân loại sắp hết' : 'Đang tải…'}</p></div>
      <button className="ad-btn ad-btn--primary" onClick={() => { setError(''); setStatus(''); setCreating(true); }}><Icon name="plus" />Thêm sản phẩm</button>
    </div>
    {error && !open && !creating && <p role="alert" className="ad-error">{error}</p>}
    {status && !open && !creating && <p role="status" className="ad-toast">{status}</p>}
    <section className="ad-card">
      <div className="ad-toolbar">
        <div className="ad-tabs" role="tablist" aria-label="Lọc nhanh">
          {quick.map(([value, label]) => <button key={value} role="tab" aria-selected={show === value} className={show === value ? 'is-on' : ''} onClick={() => set('show', value)}>{label}</button>)}
          <button role="tab" aria-selected={!!stock} className={'is-warn' + (stock ? ' is-on' : '')} onClick={() => set('stock', stock ? '' : 'low')}>Sắp hết<i>{lowCount}</i></button>
        </div>
        <div className="ad-row">
          <select aria-label="Danh mục" value={category} onChange={event => set('category', event.target.value)} className="ad-select"><option value="">Mọi danh mục</option>{categories.map(name => <option key={name}>{name}</option>)}</select>
          <div className="ad-search ad-search--inline"><Icon name="search" /><input type="search" value={q} onChange={event => set('q', event.target.value)} placeholder="Tên, slug hoặc SKU" aria-label="Tìm sản phẩm" /></div>
        </div>
      </div>
      {!rows ? <p className="ad-muted ad-pad" role="status">Đang tải sản phẩm…</p> : !list.length ? <Empty title="Không có sản phẩm phù hợp">Bỏ bớt bộ lọc hoặc thêm sản phẩm mới.</Empty> :
        <div className="ad-table-wrap"><table className="ad-table ad-table--click">
          <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th className="num">Giá bán</th><th>Tồn kho</th><th>Trạng thái</th></tr></thead>
          <tbody>{list.map(product => {
            const active = product.variants.filter(variant => variant.isActive);
            const units = active.reduce((sum, variant) => sum + variant.stock, 0);
            const lows = active.filter(low).length;
            return <tr key={product.id} onClick={() => openProduct(product.id)} className={product.isActive ? '' : 'is-off'}>
              <td><div className="ad-prod"><ProductImage className="ad-thumb" slug={product.slug} source={product.images[0]} thumbnail alt="" />
                <span><button className="ad-code ad-code--name" onClick={event => { event.stopPropagation(); openProduct(product.id); }}>{product.name}</button><small>/{product.slug}</small></span></div></td>
              <td>{product.category}{product.isLiveFish && <span className="ad-flag ad-flag--live">Cá sống</span>}</td>
              <td className="num">{saleActive(product) ? <><strong className="ad-sale">{money(product.salePrice!)}</strong><small><s>{money(product.price)}</s></small></> : <strong>{money(product.price)}</strong>}</td>
              <td className="ad-nowrap"><span className="ad-meter" aria-hidden="true">{active.slice(0, 8).map(variant => <i key={variant.id} className={variant.stock === 0 ? 'is-out' : low(variant) ? 'is-low' : ''} />)}</span>
                <small>{units} trong {active.length} phân loại{lows ? <> · <b className="ad-warn">{lows} sắp hết</b></> : null}</small></td>
              <td>{product.isActive ? <span className="ad-pill ad-pill--delivered">Đang bán</span> : <span className="ad-pill ad-pill--cancelled">Đang ẩn</span>}
                {saleActive(product) && <span className="ad-flag ad-flag--sale">Sale</span>}</td>
            </tr>;
          })}</tbody></table></div>}
    </section>
    {open && <ProductDrawer product={open} save={save} busy={busy} token={token} notice={notice} onClose={() => setOpenId(undefined)} />}
    {creating && <Drawer wide title="Thêm sản phẩm" subtitle="Lưu sản phẩm trước, sau đó thêm phân loại (dòng, cỡ, tồn kho)." onClose={() => setCreating(false)}>
      {notice}
      <ProductForm busy={busy} token={token} save={async (path, method, body) => {
        setBusy(true); setError(''); setStatus('');
        try {
          const created = await api<Product>(path, { token, method, body });
          setRows(await api<Product[]>(productsPath, { token }));
          setCreating(false); setStatus('Đã thêm "' + created.name + '". Thêm phân loại để bắt đầu bán.'); setOpenId(created.id); onChange?.();
        } catch (reason) { setError(errorText(reason)); throw reason; } finally { setBusy(false); }
      }} />
    </Drawer>}
  </div>;
}
