import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { api, errorText, LivePolicy, money, Product, query } from './api';
import { cartFromSession, saveCart } from './cart';
import { ProductImage, PhotoCredit } from './photos';

export function Catalog() {
  const [rows, setRows] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [maxCm, setMaxCm] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState('Đang tải sản phẩm…');
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<Product[]>('/products' + query({ search, category }), { signal: controller.signal })
        .then(result => {
          setRows(result); setStatus(result.length ? '' : 'Không tìm thấy sản phẩm phù hợp.');
          if (!search && !category) setCategories([...new Set(result.map(row => row.category))]);
        }).catch(reason => { if (!controller.signal.aborted) setStatus(errorText(reason)); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, category]);
  const filtered = rows.filter(product => {
    const [low, high] = priceRange ? priceRange.split('-').map(Number) : [0, Infinity];
    return product.price >= low && product.price <= high && (!difficulty || product.careInfo?.difficulty === difficulty) &&
      (!maxCm || (product.careInfo && product.careInfo.adultCm <= Number(maxCm)));
  });
  return <>
    <section className="shell hero">
      <div className="hero-copy"><p className="eyebrow">LONG FISH · CÁ CẢNH NƯỚC NGỌT</p><h1>Một góc nước.<br /><em>Một thế giới.</em></h1>
        <p>Chọn cá hợp với bể của bạn. Xem thông số nuôi và tìm đủ cây, thức ăn, thiết bị để chăm bể mỗi ngày.</p>
        <a className="button" href="#san-pham">Khám phá sản phẩm <span aria-hidden>↘</span></a>
      </div>
      <div className="hero-art tank"><img src="/catalog/photos/betta-halfmoon-1.webp" alt="Cá Betta halfmoon chụp trong bể" width={640} height={420} fetchPriority="high" />
        <span className="bubbles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
        <Link className="tank-tag" to="/product/betta-halfmoon">Betta Halfmoon<small>Xem cá →</small></Link></div>
    </section>
    <section className="shell section" id="san-pham">
      <div className="section-title"><div><p className="eyebrow">KHÁM PHÁ LONG FISH</p><h2>Cá cảnh và thủy sinh</h2></div>
        <label className="search"><span className="sr-only">Tìm sản phẩm</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm sản phẩm…" /></label>
      </div>
      <div className="filters" aria-label="Danh mục">{['', ...categories].map(value =>
        <button key={value} className={value === category ? 'chosen' : ''} aria-pressed={value === category} onClick={() => setCategory(value)}>{value || 'Tất cả'}</button>)}</div>
      <div className="catalog-filters">
        <label>Khoảng giá<select value={priceRange} onChange={e => setPriceRange(e.target.value)}><option value="">Tất cả</option><option value="0-99999">Dưới 100.000 ₫</option><option value="100000-299999">100.000–299.999 ₫</option><option value="300000-20000000">Từ 300.000 ₫</option></select></label>
        <label>Độ khó nuôi<select value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="">Tất cả</option>{['Dễ','Trung bình','Nâng cao'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Cỡ cá trưởng thành<select value={maxCm} onChange={e => setMaxCm(e.target.value)}><option value="">Tất cả</option>{[5,10,20,30].map(cm => <option key={cm} value={cm}>Đến {cm} cm</option>)}</select></label>
      </div>
      {(status || !filtered.length) && <p role="status">{status || 'Không tìm thấy sản phẩm phù hợp.'}</p>}
      <div className="grid-products">{filtered.map(product => {
        const available = product.variants.filter(variant => variant.stock >= variant.minQty);
        const stock = available.length ? available.some(variant => variant.stock > variant.minQty + 4) ? 'Còn hàng' : 'Sắp hết' : 'Hết hàng';
        return <Link className="product-card" key={product.id} to={'/product/' + product.slug}>
          <div className="product-art tank"><ProductImage slug={product.slug} source={product.images[0]} thumbnail alt={product.name} /><span className={'badge stock-' + (stock === 'Còn hàng' ? 'in' : stock === 'Sắp hết' ? 'low' : 'out')}>{stock}</span></div>
          <span className="price-tag">{money(product.price)}</span><p className="eyebrow">{product.category}</p><h3>{product.name}</h3>
        </Link>;
      })}</div>
    </section>
  </>;
}

export function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [product, setProduct] = useState<Product>();
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState<LivePolicy>();
  useEffect(() => { api<LivePolicy>('/shipping/policy').then(setPolicy).catch(() => {}); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setProduct(undefined); setError(''); setPhoto(0); setQuantity(1);
    api<Product>('/products/' + slug, { signal: controller.signal }).then(row => {
      const params = new URLSearchParams(search);
      const selected = row.variants.find(v => v.id === params.get('variant')) ??
        row.variants.find(v => v.stock >= v.minQty) ?? row.variants[0];
      setProduct(row); setVariantId(selected?.id || '');
      if (selected) setQuantity(Math.max(selected.minQty, Math.min(Math.trunc(Number(params.get('quantity'))) || selected.minQty, selected.stock, 99)));
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [slug, search]);
  const variant = product?.variants.find(v => v.id === variantId);
  if (!product) return <div className="shell section" role={error ? 'alert' : 'status'}>{error || 'Đang tải sản phẩm…'}</div>;
  const colors = [...new Set(product.variants.map(v => v.color))];
  const byColor = product.variants.filter(v => v.color === variant?.color);
  const sizes = [...new Set(byColor.map(v => v.size))];
  const bySize = byColor.filter(v => v.size === variant?.size);
  const select = (rows: typeof byColor) => {
    const next = rows.find(v => v.stock >= v.minQty) ?? rows[0];
    if (next) { setVariantId(next.id); setQuantity(next.minQty); }
  };
  const buy = () => {
    if (!variant || quantity < variant.minQty || quantity > variant.stock) return;
    const cart = cartFromSession().filter(row => row.variantId !== variant.id);
    saveCart([...cart, { slug: product.slug, variantId: variant.id, quantity }]);
    navigate('/checkout');
  };
  return <section className="shell section">
    <Link to="/" className="back">← Cửa hàng</Link>
    <div className="detail">
      <div><div className="product-art tank"><ProductImage slug={product.slug} source={product.images[photo]} alt={product.name} loading="eager" /></div>
        <PhotoCredit slug={product.slug} file={product.images[photo]} />
        {product.isLiveFish && <small className="photo-credit">Ảnh minh họa dòng cá; màu sắc và hoa văn từng con có thể khác nhau.</small>}
        {product.images.length > 1 && <div className="filters">{product.images.map((src, i) => <button key={i} aria-pressed={i === photo} onClick={() => setPhoto(i)}>Ảnh {i + 1}</button>)}</div>}</div>
      <div className="detail-copy"><p className="eyebrow">{product.category}</p><h1>{product.name}</h1>
        <p className="price">{money(variant?.priceOverride ?? product.price)}</p><p>{product.description}</p>
        <fieldset><legend>Dòng / màu</legend><div className="filters">{colors.map(color => <button key={color} aria-pressed={color === variant?.color} className={color === variant?.color ? 'chosen' : ''} onClick={() => select(product.variants.filter(v => v.color === color))}>{color}</button>)}</div></fieldset>
        <fieldset><legend>Cỡ</legend><div className="filters">{sizes.map(size => <button key={size} aria-pressed={size === variant?.size} className={size === variant?.size ? 'chosen' : ''} onClick={() => select(byColor.filter(v => v.size === size))}>{size}</button>)}</div></fieldset>
        {product.isLiveFish && <fieldset><legend>Giới tính</legend><div className="filters">{bySize.map(v => <button key={v.id} aria-pressed={v.id === variantId} className={v.id === variantId ? 'chosen' : ''} onClick={() => select([v])}>{v.gender}</button>)}</div></fieldset>}
        {variant && <p role="status" className="stock">{variant.stock >= variant.minQty ? 'Còn ' + variant.stock + ' ' + variant.unit : 'Hết hàng hoặc chưa đủ lượng tối thiểu'} · Tối thiểu {variant.minQty} {variant.unit}</p>}
        {variant && <div className="buy"><label><span className="sr-only">Số lượng</span><input type="number" min={variant.minQty} max={Math.min(variant.stock, 99)} disabled={variant.stock < variant.minQty} value={quantity}
          onChange={e => setQuantity(Math.max(variant.minQty, Math.min(Math.trunc(Number(e.target.value)), variant.stock, 99)))} /></label>
          <button className="button" disabled={variant.stock < variant.minQty} onClick={buy}>Mua ngay →</button></div>}
        {(!variant || variant.stock < variant.minQty) && !!product.alternatives?.length && <aside className="panel stack alternatives" aria-label="Mẫu cùng nhóm còn hàng"><h2>Mẫu cùng nhóm còn hàng</h2>
          <div className="alt-grid">{product.alternatives.map(item => <Link key={item.id} className="product-card" to={'/product/' + item.slug}><strong>{item.name}</strong><span>{money(item.price)}</span></Link>)}</div></aside>}
        {product.isLiveFish && policy && <aside className="policy"><strong>Cam kết cá sống khi nhận</strong><p>{policy.doaPolicy}</p></aside>}
        {product.isLiveFish && product.careInfo && <div className="panel stack"><h2>Thông số nuôi tham khảo</h2><dl className="care-grid">
          {Object.entries({ 'Tên khoa học': product.careInfo.scientificName, 'Cỡ trưởng thành': product.careInfo.adultCm + ' cm',
            'Nhiệt độ': product.careInfo.temperature, 'pH': product.careInfo.ph, 'Bể tham khảo': 'Từ ' + product.careInfo.minTankLiters + ' L',
            'Độ khó': product.careInfo.difficulty, 'Tính cách': product.careInfo.temperament, 'Thức ăn': product.careInfo.food })
            .map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          {product.careInfo.source && /^https:\/\//.test(product.careInfo.source) && <a className="text-button" href={product.careInfo.source}>Nguồn tham khảo</a>}</div>}
      </div>
    </div>
  </section>;
}

