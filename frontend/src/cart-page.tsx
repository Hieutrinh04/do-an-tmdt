import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Linked, money, ShippingMethod } from './api';
import { Breadcrumb } from './breadcrumb';
import { PriceTag } from './price';
import { useCart, useCartLines, useQuote, useSessionState } from './cart-data';
import { ProductImage } from './photos';
import { useSeo } from './seo';

// Trang Giỏ hàng: sửa số lượng, xóa, nhập mã giảm giá, tính phí giao dự kiến theo tỉnh/thành, tổng đơn.
export function CartPage() {
  const navigate = useNavigate();
  const { cart, update } = useCart();
  const { lines, valid, subtotal, hasLiveFish } = useCartLines(cart);
  const [province, setProvince] = useSessionState('longFish.province', '');
  const [coupon, setCoupon] = useSessionState('longFish.coupon', '');
  const [method, setMethod] = useSessionState('longFish.shippingMethod', 'STANDARD');
  const [draft, setDraft] = useState(coupon);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Linked[]>([]);
  useSeo({ title: 'Giỏ hàng | Long Fish', noindex: true });
  useEffect(() => { api<string[]>('/shipping/provinces').then(setProvinces).catch(() => {}); }, []);
  const { quote, error } = useQuote({ cart, valid, province, coupon, method: method as ShippingMethod });
  // Gợi ý mua kèm: gộp sản phẩm mua kèm của các món trong giỏ, bỏ món đã có.
  const slugKey = [...new Set(lines.map(line => line.slug))].join(',');
  useEffect(() => {
    let alive = true;
    const inCart = new Set(slugKey.split(',').filter(Boolean));
    Promise.all([...inCart].map(slug => api<{ crossSells?: Linked[] }>('/products/' + slug).then(row => row.crossSells || []).catch(() => [] as Linked[])))
      .then(groups => { if (alive) setSuggestions([...new Map(groups.flat().filter(item => !inCart.has(item.slug)).map(item => [item.slug, item])).values()].slice(0, 4)); });
    return () => { alive = false; };
  }, [slugKey]);
  const free = quote ? quote.freeThreshold - quote.subtotal : 0;
  return <section className="shell section">
    <Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: 'Giỏ hàng' }]} />
    <h1>Giỏ hàng</h1>
    {!lines.length ? <div className="panel stack"><p>Giỏ hàng của bạn đang trống.</p><Link className="button" to="/">Tiếp tục mua sắm</Link></div> :
      <div className="cart-layout">
        <div className="panel stack">
          <div className="cart-table" role="table" aria-label="Sản phẩm trong giỏ hàng">
            <div className="cart-head" role="row"><span role="columnheader">Sản phẩm</span><span role="columnheader">Giá</span><span role="columnheader">Số lượng</span><span role="columnheader">Thành tiền</span><span role="columnheader"><span className="sr-only">Xóa</span></span></div>
            {lines.map(line => <div className="cart-row" role="row" key={line.variantId}>
              <div className="cart-product" role="cell">
                {line.product && <ProductImage className="thumb" slug={line.slug} source={line.product.images[0]} thumbnail alt={line.product.name} />}
                <div><Link to={'/san-pham/' + line.slug}><strong>{line.product?.name || 'Sản phẩm không khả dụng'}</strong></Link>
                  <small>{line.variant ? line.variant.color + ' / ' + line.variant.size + (line.product?.isLiveFish ? ' / ' + line.variant.gender : '') : 'Phân loại không khả dụng'}</small>
                  {line.variant && line.quantity > line.variant.stock && <small className="error">Chỉ còn {line.variant.stock} {line.variant.unit}.</small>}</div>
              </div>
              <div role="cell" data-label="Giá"><PriceTag regular={line.regular} unit={line.unit} /></div>
              <div role="cell" data-label="Số lượng"><label><span className="sr-only">Số lượng {line.product?.name}</span>
                <input className="quantity" type="number" min={line.variant?.minQty || 1} max={Math.min(line.variant?.stock || 1, 99)} disabled={!line.variant || line.variant.stock < line.variant.minQty} value={line.quantity}
                  onChange={event => update(line.variantId, Math.min(line.variant?.stock || 1, Math.max(line.variant?.minQty || 1, Math.trunc(Number(event.target.value)) || 1), 99))} /></label></div>
              <div role="cell" data-label="Thành tiền"><strong>{money(line.total)}</strong></div>
              <div role="cell"><button type="button" className="text-button" aria-label={'Xóa ' + (line.product?.name || 'sản phẩm') + ' khỏi giỏ'} onClick={() => update(line.variantId, 0)}>Xóa</button></div>
            </div>)}
          </div>
          <p className="muted">Thay đổi số lượng được cập nhật ngay, không cần bấm thêm nút.</p>
          {suggestions.length > 0 && <aside className="cross-sell" aria-label="Mua kèm"><h2>Mua kèm cho bể của bạn</h2>
            <div className="mini-grid">{suggestions.map(item => <Link key={item.slug} to={'/san-pham/' + item.slug} className="mini-card">
              <ProductImage slug={item.slug} source={item.images[0]} thumbnail alt={item.name} /><strong>{item.name}</strong><span>{money(item.currentPrice ?? item.price)}</span></Link>)}</div></aside>}
        </div>
        <aside className="panel stack cart-summary" aria-label="Tổng đơn hàng"><h2>Tổng đơn hàng</h2>
          <label>Tỉnh / thành (ước tính phí giao)<input list="cart-provinces" value={province} onChange={event => setProvince(event.target.value)} placeholder="Ví dụ: Hồ Chí Minh" autoComplete="address-level1" /></label>
          <datalist id="cart-provinces">{provinces.map(name => <option key={name} value={name} />)}</datalist>
          <form className="coupon" onSubmit={event => { event.preventDefault(); setCoupon(draft.trim().toUpperCase()); }}>
            <label>Mã giảm giá<input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Nhập mã" maxLength={40} autoCapitalize="characters" /></label>
            <button className="outline" type="submit">Áp dụng</button>
          </form>
          {quote?.coupon && <p role="status" className="success">Đã áp dụng mã <strong>{quote.coupon.code}</strong>: {quote.coupon.description || 'ưu đãi được tính vào tổng đơn.'} <button type="button" className="text-button" onClick={() => { setCoupon(''); setDraft(''); }}>Bỏ mã</button></p>}
          {coupon && quote && !quote.coupon && quote.couponError && <p role="alert" className="error">{quote.couponError}</p>}
          <div className="totals">
            <span>Tổng phụ</span><span>{money(subtotal)}</span>
            <span>Phí vận chuyển</span><span>{province.trim() && quote ? money(quote.shippingFee) : 'Nhập tỉnh/thành'}</span>
            {quote && quote.discount > 0 && <><span>Mã giảm giá {quote.coupon?.code}</span><span className="success">-{money(quote.discount)}</span></>}
            {quote && quote.shippingDiscount > 0 && <><span>Miễn phí vận chuyển ({quote.coupon?.code})</span><span className="success">-{money(quote.shippingDiscount)}</span></>}
            {quote && quote.packingFee > 0 && <><span>Đóng gói cá sống</span><span>{money(quote.packingFee)}</span></>}
            <strong>Tổng cộng</strong><strong>{quote && (province.trim() || !hasLiveFish) ? money(quote.total) : money(subtotal)}</strong>
          </div>
          {quote && free > 0 && !quote.coupon?.kind.includes('FREESHIP') && <small>Mua thêm {money(free)} để được miễn phí vận chuyển tiêu chuẩn.</small>}
          {quote && !quote.liveDeliveryAvailable && <p role="alert" className="error">Long Fish chưa giao cá sống đến tỉnh/thành này. Bạn có thể đặt phụ kiện.</p>}
          {error && <p role="alert" className="error">{error}</p>}
          <div className="cart-actions">
            <Link className="outline button-link" to="/">Tiếp tục mua sắm</Link>
            <button className="button" type="button" disabled={!valid || (quote ? !quote.liveDeliveryAvailable : false)} onClick={() => navigate('/checkout')}>Tiến hành thanh toán →</button>
          </div>
        </aside>
      </div>}
  </section>;
}
