import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, Confirmation, errorText, labels, LivePolicy, localDate, money, Payment, Product, query, Tracked } from './api';
import { ProductImage } from './photos';
import { cartFromSession, receiptKey, saveCart, session } from './cart';

export function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(cartFromSession);
  const [catalog, setCatalog] = useState<Record<string, Product | null>>({});
  const [provinces, setProvinces] = useState<string[]>([]);
  const [province, setProvince] = useState('');
  const [payment, setPayment] = useState<Payment>('COD');
  const [fee, setFee] = useState<{ shippingFee: number; packingFee: number; total: number; liveDeliveryAvailable: boolean; province: string; cartKey: string }>();
  const [policy, setPolicy] = useState<LivePolicy>();
  const [doaAccepted, setDoaAccepted] = useState(false);
  const [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const slugs = [...new Set(cart.map(line => line.slug))].join(',');
  useEffect(() => {
    const controller = new AbortController();
    if (slugs) Promise.all(slugs.split(',').map(async slug => {
      try { return [slug, await api<Product>('/products/' + slug, { signal: controller.signal })] as const; }
      catch { return [slug, null] as const; }
    })).then(rows => { if (!controller.signal.aborted) setCatalog(Object.fromEntries(rows)); });
    return () => controller.abort();
  }, [slugs]);
  useEffect(() => {
    api<string[]>('/shipping/provinces').then(setProvinces).catch(() => {});
    api<LivePolicy>('/shipping/policy').then(setPolicy).catch(() => {});
  }, []);
  const lines = cart.map(line => {
    const product = catalog[line.slug];
    const variant = product?.variants.find(v => v.id === line.variantId);
    return { ...line, product, variant, price: variant?.priceOverride ?? product?.price ?? 0 };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const hasLiveFish = lines.some(line => line.product?.isLiveFish);
  const valid = !!lines.length && lines.every(line => line.variant && line.quantity >= line.variant.minQty && line.quantity <= line.variant.stock);
  const cartKey = JSON.stringify(cart.map(({ variantId, quantity }) => ({ variantId, quantity })));
  useEffect(() => {
    const controller = new AbortController();
    setFee(undefined); setQuoteError('');
    if (!province.trim() || !valid) return;
    const timer = window.setTimeout(() => api<{ shippingFee: number; packingFee: number; total: number; liveDeliveryAvailable: boolean }>('/shipping/quote', {
      method: 'POST', body: { province, items: JSON.parse(cartKey) }, signal: controller.signal,
    }).then(result => setFee({ ...result, province, cartKey }))
      .catch(reason => { if (!controller.signal.aborted) setQuoteError(errorText(reason)); }), 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [province, cartKey, valid]);
  const update = (id: string, quantity: number) => {
    const next = quantity ? cart.map(line => line.variantId === id ? { ...line, quantity } : line) : cart.filter(line => line.variantId !== id);
    setCart(next); saveCart(next);
  };
  const currentFee = fee?.cartKey === cartKey && fee.province === province ? fee : undefined;
  const blocked = currentFee?.liveDeliveryAvailable === false;
  const removeLiveFish = () => {
    const next = cart.filter(line => !catalog[line.slug]?.isLiveFish);
    setCart(next); saveCart(next); setDoaAccepted(false);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !valid || !currentFee || blocked || (hasLiveFish && !doaAccepted)) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (!/^0[35789]\d{8}$/.test(String(fields.phone).trim().replace(/[ .()-]/g, '').replace(/^\+84/, '0'))) {
      setError('Nhập số điện thoại di động Việt Nam hợp lệ.'); return;
    }
    setBusy(true); setError('');
    try {
      const result = await api<Confirmation>('/orders', { method: 'POST', body: {
        ...fields, doaAccepted, preferredDelivery: fields.preferredDelivery ? new Date(String(fields.preferredDelivery)).toISOString() : undefined,
        paymentMethod: payment, psid: sessionStorage.getItem('longFish.psid') || undefined, context: sessionStorage.getItem('longFish.context') || undefined,
        items: cart.map(({ variantId, quantity }) => ({ variantId, quantity })),
      } });
      sessionStorage.setItem(receiptKey, JSON.stringify(result)); saveCart([]);
      navigate('/confirmation', { replace: true });
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <section className="shell section">
    <Link to="/" className="back">← Tiếp tục mua sắm</Link><p className="eyebrow">GIỎ HÀNG</p><h1>Chốt đơn</h1>
    {!lines.length ? <div className="panel"><p>Giỏ hàng đang trống.</p><Link className="button" to="/">Xem sản phẩm</Link></div> :
      <form className="checkout" onSubmit={submit}>
        <div className="panel stack"><h2>Thông tin nhận hàng</h2>
          <label>Họ và tên<input name="customerName" autoComplete="name" required maxLength={100} /></label>
          <label>Số điện thoại<input name="phone" type="tel" autoComplete="tel" required maxLength={25} /></label>
          <div className="stack-tight"><label>Email (không bắt buộc)<input name="email" type="email" autoComplete="email" maxLength={254} placeholder="ban@vidu.com" aria-describedby="email-hint" /></label>
            <small id="email-hint">Chỉ dùng để gửi xác nhận đơn và thông báo giao hàng, không dùng quảng cáo.</small></div>
          <div className="two"><label>Tỉnh / thành<input name="province" autoComplete="address-level1" list="provinces" required maxLength={100} value={province} onChange={e => setProvince(e.target.value)} /></label>
            <label>Quận / huyện<input name="district" autoComplete="address-level2" required maxLength={100} /></label></div>
          <datalist id="provinces">{provinces.map(name => <option key={name} value={name} />)}</datalist>
          <label>Địa chỉ cụ thể<input name="address" autoComplete="street-address" required maxLength={200} /></label>
          <label>Ngày giờ nhận mong muốn<input type="datetime-local" name="preferredDelivery" /></label>
          <label>Ghi chú nhận hàng<textarea name="note" maxLength={300} rows={2} /></label>
          {hasLiveFish && <aside className="policy"><strong>Cam kết cá sống khi nhận</strong>
            <p>{policy?.doaPolicy || 'Đang tải chính sách…'}</p>
            {policy && <small>Giao cá sống tại {policy.liveProvinces.join(', ') || 'chưa có khu vực hỗ trợ'}.</small>}
            <label className="radio"><input type="checkbox" required disabled={!policy} checked={doaAccepted} onChange={e => setDoaAccepted(e.target.checked)} /> Tôi đã đọc chính sách cá sống</label>
          </aside>}
          <fieldset><legend>Thanh toán</legend>
            <label className="radio"><input type="radio" checked={payment === 'COD'} onChange={() => setPayment('COD')} /> Tiền mặt khi nhận hàng</label>
            <label className="radio"><input type="radio" checked={payment === 'BANK_QR'} onChange={() => setPayment('BANK_QR')} /> Chuyển khoản VietQR</label>
            {payment === 'BANK_QR' && <small>Mã QR hiện sau khi đặt đơn.</small>}
          </fieldset>
        </div>
        <div className="panel stack summary"><h2>Đơn của bạn</h2>
          {lines.map(line => <div className="line" key={line.variantId}>
            {line.product && <ProductImage className="thumb" slug={line.slug} source={line.product.images[0]} thumbnail alt="" />}
            <div><strong>{line.product?.name || 'Sản phẩm không khả dụng'}</strong><small>{line.variant ? line.variant.color + ' / ' + line.variant.size + (line.product?.isLiveFish ? ' / ' + line.variant.gender : '') + ' · ' + line.variant.unit : 'Phân loại không khả dụng'}</small>
              {line.variant && line.quantity > line.variant.stock && <small className="error">Chỉ còn {line.variant.stock} sản phẩm.</small>}
              <button className="text-button" type="button" onClick={() => update(line.variantId, 0)}>Xóa</button></div>
            <label><span className="sr-only">Số lượng {line.product?.name}</span><input className="quantity" type="number" min={line.variant?.minQty || 1} max={Math.min(line.variant?.stock || 1, 99)} disabled={!line.variant || line.variant.stock < line.variant.minQty} value={line.quantity}
              onChange={e => update(line.variantId, Math.min(line.variant?.stock || 1, Math.max(line.variant?.minQty || 1, Math.trunc(Number(e.target.value)) || 1), 99))} /></label>
          </div>)}
          <div className="totals"><span>Tiền hàng</span><span>{money(subtotal)}</span><span>Phí giao hàng</span><span>{currentFee ? money(currentFee.shippingFee) : '—'}</span><span>Đóng gói cá sống</span><span>{currentFee ? money(currentFee.packingFee) : '—'}</span>
            <strong>Tổng thanh toán</strong><strong>{currentFee ? money(currentFee.total) : '—'}</strong></div>
          {blocked && <div className="policy" role="alert"><p>Long Fish chưa giao cá sống đến tỉnh/thành này. Bạn có thể đặt phụ kiện.</p><button className="outline" type="button" onClick={removeLiveFish}>Bỏ cá sống khỏi giỏ</button></div>}
          {(error || quoteError) && <p role="alert" className="error">{error || quoteError}</p>}
          <button className="button wide" disabled={!valid || busy || !currentFee || blocked || (hasLiveFish && !doaAccepted)}>{busy ? 'Đang đặt hàng…' : 'Đặt hàng →'}</button>
        </div>
      </form>}
  </section>;
}

export function Confirm() {
  const receipt = session<Confirmation | null>(receiptKey, null);
  const [copied, setCopied] = useState('');
  if (!receipt) return <section className="shell section"><h1>Tra cứu đơn hàng</h1><Link to="/track">Nhập mã đơn và số điện thoại →</Link></section>;
  return <section className="shell section narrow"><p className="eyebrow">ĐẶT HÀNG THÀNH CÔNG</p><h1>Cảm ơn bạn!</h1>
    <div className="panel stack"><div className="line"><strong>{receipt.code}</strong><button className="outline" onClick={async () => {
      try { await navigator.clipboard.writeText(receipt.code); setCopied('Đã sao chép'); } catch { setCopied('Hãy chọn và sao chép mã'); }
    }}>{copied || 'Sao chép mã'}</button></div>
      {receipt.items.map(item => <div key={item.id} className="line"><span>{item.productName} · {item.color} / {item.size} {item.gender === "Không phân biệt" ? "" : " / " + item.gender} × {item.quantity} {item.unit}</span><span>{money(item.unitPrice * item.quantity)}</span></div>)}
      <div className="totals"><span>Tiền hàng</span><span>{money(receipt.subtotal)}</span><span>Giao hàng</span><span>{money(receipt.shippingFee)}</span><span>Đóng gói cá sống</span><span>{money(receipt.packingFee)}</span><strong>Tổng</strong><strong>{money(receipt.total)}</strong></div>
      {receipt.qrUrl ? <div className="qr"><h2>Chuyển khoản VietQR</h2>{receipt.mock && <p className="error">Mã dùng thử. Không chuyển khoản.</p>}
        <img src={receipt.qrUrl} width={240} alt={'VietQR cho đơn ' + receipt.code} /><p>Nội dung chuyển khoản <strong>{receipt.code}</strong></p></div> : <p>Thanh toán khi nhận hàng.</p>}
      <Link className="button" to={'/track' + query({ code: receipt.code })}>Tra cứu đơn →</Link>
    </div>
  </section>;
}

export function Track() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [phone, setPhone] = useState('');
  const [lookup, setLookup] = useState<{ code: string; phone: string }>();
  const [order, setOrder] = useState<Tracked>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    const check = () => api<Tracked>('/orders/track' + query(lookup), { signal: controller.signal })
      .then(result => { setOrder(result); setError(''); })
      .catch(reason => { if (!controller.signal.aborted) { setOrder(undefined); setError(errorText(reason)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void check();
    const timer = window.setInterval(check, 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [lookup]);
  return <section className="shell section narrow"><p className="eyebrow">THEO DÕI GIAO HÀNG</p><h1>Tra cứu đơn hàng</h1>
    <form className="panel stack" onSubmit={event => { event.preventDefault(); setLoading(true); setOrder(undefined); setError(''); setLookup({ code, phone }); }}>
      <label>Mã đơn<input value={code} onChange={e => setCode(e.target.value)} required maxLength={21} placeholder="DH20261108-0001" /></label>
      <label>Số điện thoại đặt hàng<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required maxLength={25} /></label>
      <button className="button" disabled={loading}>{loading ? 'Đang tra cứu…' : 'Tra cứu →'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    {order && <div className="panel stack tracking" aria-live="polite"><div className="line"><h2>{order.code}</h2><span className="badge">{labels[order.status]}</span></div>
      <p>{money(order.total)} · {order.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</p>
      <ol className="timeline">{order.history.map(({ toStatus, changedAt }) => <li key={toStatus}><strong>{labels[toStatus]}</strong><small>{localDate(changedAt)}</small></li>)}</ol>
      <small>Tự cập nhật mỗi 15 giây.</small></div>}
  </section>;
}

