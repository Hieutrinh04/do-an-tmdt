import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, Confirmation, errorText, labels, LivePolicy, localDate, money, Payment, PaymentConfig, query, ShippingMethod, Tracked } from './api';
import { ProductImage } from './photos';
import { receiptKey, session } from './cart';
import { useCart, useCartLines, useQuote, useSessionState } from './cart-data';
import { useCustomer } from './auth';
import { Breadcrumb } from './breadcrumb';
import { PriceTag } from './price';

const paymentOptions: { id: Payment; title: string; description: string; badge: string }[] = [
  { id: 'COD', title: 'Thanh toán khi nhận hàng (COD)', description: 'Trả tiền mặt cho nhân viên giao hàng sau khi kiểm tra đơn.', badge: 'COD' },
  { id: 'BANK_QR', title: 'Chuyển khoản VietQR', description: 'Quét mã QR bằng ứng dụng ngân hàng, nội dung chuyển khoản là mã đơn.', badge: 'VietQR' },
];

export function Checkout() {
  const navigate = useNavigate();
  const { cart, update, clear } = useCart();
  const { lines, valid, subtotal, hasLiveFish } = useCartLines(cart);
  const { customer, token } = useCustomer();
  const [provinces, setProvinces] = useState<string[]>([]);
  const [province, setProvince] = useSessionState('longFish.province', '');
  const [coupon, setCoupon] = useSessionState('longFish.coupon', '');
  const [method, setMethod] = useSessionState('longFish.shippingMethod', 'STANDARD');
  const [couponDraft, setCouponDraft] = useState(coupon);
  const [payment, setPayment] = useState<Payment>('COD');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const [policy, setPolicy] = useState<LivePolicy>();
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>();
  const [doaAccepted, setDoaAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefill, setPrefill] = useState(0);
  useEffect(() => {
    api<string[]>('/shipping/provinces').then(setProvinces).catch(() => {});
    api<LivePolicy>('/shipping/policy').then(setPolicy).catch(() => {});
    api<PaymentConfig>('/payments/config').then(setPaymentConfig).catch(() => {});
  }, []);
  const bankUnavailable = paymentConfig?.bankTransfer === false;
  useEffect(() => { if (bankUnavailable) setPayment('COD'); }, [bankUnavailable]);
  // Khách đã đăng nhập: tự điền địa chỉ giao hàng đã lưu và email của tài khoản.
  const saved = customer?.shippingAddress;
  useEffect(() => {
    if (!customer) return;
    setEmail(current => current || customer.email);
    if (saved) { setPhone(current => current || saved.phone); setProvince(saved.province); setPrefill(value => value + 1); }
    else setPhone(current => current || customer.phone);
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { quote, error: quoteError } = useQuote({ cart, valid, province, coupon, method: method as ShippingMethod, phone: phone.trim(), email: email.trim() });
  const blocked = quote?.liveDeliveryAvailable === false;
  const ready = valid && !!quote && !blocked && !!province.trim();
  const removeLiveFish = () => { for (const line of lines) if (line.product?.isLiveFish) update(line.variantId, 0); setDoaAccepted(false); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || (hasLiveFish && !doaAccepted)) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (!/^0[35789]\d{8}$/.test(String(fields.phone).trim().replace(/[ .()-]/g, '').replace(/^\+84/, '0'))) { setError('Nhập số điện thoại di động Việt Nam hợp lệ.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api<Confirmation>('/orders', { method: 'POST', body: {
        customerName: fields.customerName, phone: fields.phone, email: fields.email, province: fields.province, district: fields.district, ward: fields.ward,
        address: fields.address, note: fields.note, doaAccepted, paymentMethod: payment, shippingMethod: method, couponCode: coupon || undefined,
        preferredDelivery: fields.preferredDelivery ? new Date(String(fields.preferredDelivery)).toISOString() : undefined,
        createAccount: createAccount && !token ? { password: fields.accountPassword } : undefined,
        psid: sessionStorage.getItem('longFish.psid') || undefined, context: sessionStorage.getItem('longFish.context') || undefined,
        items: cart.map(({ variantId, quantity }) => ({ variantId, quantity })),
      } });
      // Số điện thoại chỉ lưu tạm trong phiên khi ở chế độ sandbox, để nút giả lập chuyển khoản xác thực được đơn.
      sessionStorage.setItem(receiptKey, JSON.stringify(result.sandbox ? { ...result, phone: String(fields.phone) } : result));
      clear(); setCoupon(''); navigate('/confirmation', { replace: true });
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  return <section className="shell section">
    <Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: 'Giỏ hàng', to: '/gio-hang' }, { name: 'Thanh toán' }]} />
    <h1>Thanh toán</h1>
    {!lines.length ? <div className="panel"><p>Giỏ hàng đang trống.</p><Link className="button" to="/">Xem sản phẩm</Link></div> :
      <form className="checkout" onSubmit={submit}>
        <div className="panel stack"><h2>Thông tin nhận hàng</h2>
          {!customer && <p className="muted">Đã có tài khoản? <Link to="/tai-khoan">Đăng nhập</Link> để tự điền địa chỉ đã lưu. Bạn cũng có thể đặt hàng không cần tài khoản.</p>}
          <div key={'identity' + prefill} className="stack">
            <label>Họ và tên<input name="customerName" autoComplete="name" required maxLength={100} defaultValue={saved?.name || customer?.name || ''} /></label>
            <label>Số điện thoại<input name="phone" type="tel" autoComplete="tel" required maxLength={25} value={phone} onChange={event => setPhone(event.target.value)} /></label>
            <div className="stack-tight"><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ban@vidu.com" aria-describedby="email-hint" value={email} onChange={event => setEmail(event.target.value)} /></label>
              <small id="email-hint">Dùng để gửi email xác nhận đơn hàng và thông báo giao hàng, không dùng quảng cáo.</small></div>
            <div className="two"><label>Tỉnh / thành<input name="province" autoComplete="address-level1" list="provinces" required maxLength={100} value={province} onChange={event => setProvince(event.target.value)} /></label>
              <label>Quận / huyện<input name="district" autoComplete="address-level2" required maxLength={100} defaultValue={saved?.district || ''} /></label></div>
            <datalist id="provinces">{provinces.map(name => <option key={name} value={name} />)}</datalist>
            <div className="two"><label>Phường / xã<input name="ward" required maxLength={100} defaultValue={saved?.ward || ''} /></label>
              <label>Địa chỉ cụ thể<input name="address" autoComplete="street-address" required maxLength={200} defaultValue={saved?.address || ''} /></label></div>
          </div>
          <label>Ngày giờ nhận mong muốn (không bắt buộc)<input type="datetime-local" name="preferredDelivery" /></label>
          <label>Ghi chú đơn hàng (không bắt buộc)<textarea name="note" maxLength={300} rows={2} placeholder="Yêu cầu đặc biệt: màu sắc, thời gian giao…" /></label>
          {!token && <div className="stack-tight"><label className="radio"><input type="checkbox" checked={createAccount} onChange={event => setCreateAccount(event.target.checked)} /> Tạo tài khoản để theo dõi đơn hàng và đặt nhanh lần sau</label>
            {createAccount && <label>Mật khẩu (tối thiểu 8 ký tự, gồm chữ và số)<input name="accountPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></label>}</div>}
          {hasLiveFish && <aside className="policy"><strong>Cam kết cá sống khi nhận</strong>
            <p>{policy?.doaPolicy || 'Đang tải chính sách…'}</p>
            {policy && <small>{policy.liveEverywhere ? 'Giao cá sống toàn quốc.' : 'Giao cá sống tại ' + (policy.liveProvinces.join(', ') || 'chưa có khu vực hỗ trợ') + '.'}</small>}
            <label className="radio"><input type="checkbox" required disabled={!policy} checked={doaAccepted} onChange={event => setDoaAccepted(event.target.checked)} /> Tôi đã đọc chính sách cá sống</label>
          </aside>}
          <fieldset><legend>Phương thức vận chuyển</legend>
            {!province.trim() ? <small>Nhập tỉnh/thành để xem phí vận chuyển từng phương thức.</small> :
              (quote?.methods || []).map(option => <label key={option.id} className="radio option"><input type="radio" name="shipping" checked={method === option.id} onChange={() => setMethod(option.id)} />
                <span><strong>{option.label}</strong> · {option.fee ? money(option.fee) : 'Miễn phí'}<small>{option.description}</small></span></label>)}
          </fieldset>
          <fieldset><legend>Phương thức thanh toán</legend>
            {paymentOptions.map(option => <label key={option.id} className={'radio option' + (option.id === 'BANK_QR' && bankUnavailable ? ' disabled' : '')}>
              <input type="radio" name="payment" disabled={option.id === 'BANK_QR' && bankUnavailable} checked={payment === option.id} onChange={() => setPayment(option.id)} />
              <span><strong>{option.title}{option.id === 'BANK_QR' && paymentConfig?.sandbox ? ' (Sandbox – thử nghiệm)' : ''}</strong> <span className="pay-badge">{option.badge}</span><small>{option.description}</small></span></label>)}
            {bankUnavailable && <small>Chuyển khoản đang tạm ngưng, vui lòng chọn thanh toán khi nhận hàng.</small>}
            {!bankUnavailable && payment === 'BANK_QR' && <small>{paymentConfig?.sandbox ? 'Môi trường thử: mã QR không dùng để chuyển tiền thật.' : 'Mã QR hiện sau khi đặt đơn.'}</small>}
          </fieldset>
        </div>
        <div className="panel stack summary"><h2>Đơn của bạn</h2>
          {lines.map(line => <div className="line" key={line.variantId}>
            {line.product && <ProductImage className="thumb" slug={line.slug} source={line.product.images[0]} thumbnail alt={line.product.name} />}
            <div><strong>{line.product?.name || 'Sản phẩm không khả dụng'}</strong><small>{line.variant ? line.variant.color + ' / ' + line.variant.size + (line.product?.isLiveFish ? ' / ' + line.variant.gender : '') + ' · ' + line.variant.unit : 'Phân loại không khả dụng'}</small>
              <small><PriceTag regular={line.regular} unit={line.unit} /> × {line.quantity}</small>
              {line.variant && line.quantity > line.variant.stock && <small className="error">Chỉ còn {line.variant.stock} sản phẩm.</small>}
              <button className="text-button" type="button" onClick={() => update(line.variantId, 0)}>Xóa</button></div>
            <label><span className="sr-only">Số lượng {line.product?.name}</span><input className="quantity" type="number" min={line.variant?.minQty || 1} max={Math.min(line.variant?.stock || 1, 99)} disabled={!line.variant || line.variant.stock < line.variant.minQty} value={line.quantity}
              onChange={event => update(line.variantId, Math.min(line.variant?.stock || 1, Math.max(line.variant?.minQty || 1, Math.trunc(Number(event.target.value)) || 1), 99))} /></label>
          </div>)}
          <div className="coupon-row"><label>Mã giảm giá<input value={couponDraft} onChange={event => setCouponDraft(event.target.value)} placeholder="Nhập mã" maxLength={40} autoCapitalize="characters" /></label>
            <button className="outline" type="button" onClick={() => setCoupon(couponDraft.trim().toUpperCase())}>Áp dụng</button></div>
          {quote?.coupon && <p role="status" className="success">Đã áp dụng mã <strong>{quote.coupon.code}</strong>. <button type="button" className="text-button" onClick={() => { setCoupon(''); setCouponDraft(''); }}>Bỏ mã</button></p>}
          {coupon && quote && !quote.coupon && quote.couponError && <p role="alert" className="error">{quote.couponError}</p>}
          <div className="totals"><span>Tiền hàng</span><span>{money(subtotal)}</span>
            <span>Phí giao hàng</span><span>{quote && province.trim() ? money(quote.shippingFee) : '—'}</span>
            {quote && quote.discount > 0 && <><span>Giảm giá ({quote.coupon?.code})</span><span className="success">-{money(quote.discount)}</span></>}
            {quote && quote.shippingDiscount > 0 && <><span>Miễn phí vận chuyển ({quote.coupon?.code})</span><span className="success">-{money(quote.shippingDiscount)}</span></>}
            <span>Đóng gói cá sống</span><span>{quote && province.trim() ? money(quote.packingFee) : '—'}</span>
            <strong>Tổng thanh toán</strong><strong>{quote && province.trim() ? money(quote.total) : '—'}</strong></div>
          {blocked && <div className="policy" role="alert"><p>Long Fish chưa giao cá sống đến tỉnh/thành này. Bạn có thể đặt phụ kiện.</p><button className="outline" type="button" onClick={removeLiveFish}>Bỏ cá sống khỏi giỏ</button></div>}
          {(error || quoteError) && <p role="alert" className="error">{error || quoteError}</p>}
          <button className="button wide" disabled={!ready || busy || (hasLiveFish && !doaAccepted)}>{busy ? 'Đang đặt hàng…' : 'Đặt hàng →'}</button>
          <Link to="/gio-hang" className="text-button">← Quay lại giỏ hàng</Link>
        </div>
      </form>}
  </section>;
}

export function Confirm() {
  const receipt = session<Confirmation | null>(receiptKey, null);
  const [copied, setCopied] = useState('');
  const [paid, setPaid] = useState('');
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);
  async function simulatePayment() {
    if (!receipt?.phone || paying) return;
    setPaying(true); setPayError('');
    try { await api('/payments/sandbox/confirm', { method: 'POST', body: { code: receipt.code, phone: receipt.phone } }); setPaid('Đã ghi nhận thanh toán thử. Đơn chuyển sang trạng thái ĐÃ THANH TOÁN.'); }
    catch (reason) { setPayError(errorText(reason)); }
    finally { setPaying(false); }
  }
  if (!receipt) return <section className="shell section"><h1>Tra cứu đơn hàng</h1><Link to="/track">Nhập mã đơn và số điện thoại →</Link></section>;
  return <section className="shell section narrow"><p className="eyebrow">ĐẶT HÀNG THÀNH CÔNG</p><h1>Cảm ơn bạn!</h1>
    <div className="panel stack"><div className="line"><strong>{receipt.code}</strong><button className="outline" onClick={async () => {
      try { await navigator.clipboard.writeText(receipt.code); setCopied('Đã sao chép'); } catch { setCopied('Hãy chọn và sao chép mã'); }
    }}>{copied || 'Sao chép mã'}</button></div>
      {receipt.email && <p role="status" className="success">Chúng tôi đã gửi email xác nhận đến <strong>{receipt.email}</strong>.</p>}
      {receipt.accountCreated && <p role="status" className="success">Tài khoản của bạn đã được tạo. <Link to="/tai-khoan">Vào tài khoản</Link> để theo dõi đơn hàng.</p>}
      <div><h2>Thông tin giao hàng</h2>
        <p>{receipt.customerName}{receipt.phone ? ' · ' + receipt.phone : ''}<br />{receipt.address}<br /><small>{receipt.shippingMethod === 'EXPRESS' ? 'Giao nhanh' : 'Giao tiêu chuẩn'} · {receipt.paymentMethod === 'BANK_QR' ? 'Chuyển khoản VietQR' : 'Thanh toán khi nhận hàng'}</small></p></div>
      {receipt.items.map(item => <div key={item.id} className="line"><span>{item.productName} · {item.color} / {item.size} {item.gender === "Không phân biệt" ? "" : " / " + item.gender} × {item.quantity} {item.unit}</span><span>{money(item.unitPrice * item.quantity)}</span></div>)}
      <div className="totals"><span>Tiền hàng</span><span>{money(receipt.subtotal)}</span>
        {!!receipt.discount && <><span>Giảm giá ({receipt.couponCode})</span><span className="success">-{money(receipt.discount)}</span></>}
        <span>Giao hàng</span><span>{money(receipt.shippingFee)}</span><span>Đóng gói cá sống</span><span>{money(receipt.packingFee)}</span><strong>Tổng</strong><strong>{money(receipt.total)}</strong></div>
      {receipt.qrUrl ? <div className="qr"><h2>Chuyển khoản VietQR</h2>{(receipt.mock || receipt.sandbox) && <p className="error">{receipt.sandbox ? 'SANDBOX – môi trường thử thanh toán. Không chuyển tiền thật.' : 'Mã dùng thử. Không chuyển khoản.'}</p>}
        <img src={receipt.qrUrl} width={240} alt={'VietQR cho đơn ' + receipt.code} /><p>Nội dung chuyển khoản <strong>{receipt.code}</strong></p>
          {receipt.sandbox && receipt.phone && !paid && <button type="button" className="outline" disabled={paying} onClick={simulatePayment}>{paying ? 'Đang xử lý…' : 'Giả lập đã chuyển khoản'}</button>}
          {paid && <p role="status">{paid}</p>}{payError && <p className="error" role="alert">{payError}</p>}</div> : <p>Thanh toán khi nhận hàng.</p>}
      <div className="cart-actions"><Link className="outline button-link" to="/">Tiếp tục mua sắm</Link><Link className="button" to={'/track' + query({ code: receipt.code })}>Tra cứu đơn →</Link></div>
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

