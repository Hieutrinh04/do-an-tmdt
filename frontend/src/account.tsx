import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Address, api, Customer, errorText, labels, localDate, money, Order, Status } from './api';
import { clearCustomerToken, saveCustomerToken, useCustomer } from './auth';
import { Breadcrumb } from './breadcrumb';
import { useSeo } from './seo';

type AuthResult = { token: string; customer: Customer };
type OrderRow = { code: string; createdAt: string; status: Status; paymentStatus: 'UNPAID' | 'PAID'; paymentMethod: string; total: number; itemCount: number };

function Message({ ok, error }: { ok?: string; error?: string }) {
  return <>{ok && <p role="status" className="success">{ok}</p>}{error && <p role="alert" className="error">{error}</p>}</>;
}

// Trang /tai-khoan: chưa đăng nhập thì hiện form Đăng nhập và Đăng ký cạnh nhau (2 cột); đã đăng nhập thì hiện các mục tài khoản.
export function AccountPage() {
  const { customer, loading } = useCustomer();
  useSeo({ title: 'Tài khoản của tôi | Long Fish', noindex: true });
  if (loading) return <section className="shell section" role="status">Đang tải…</section>;
  return customer ? <Dashboard customer={customer} /> : <LoginRegister />;
}

function LoginRegister() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api<AuthResult>('/account/login', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }); saveCustomerToken(result.token); navigate('/tai-khoan'); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setRegisterError('');
    try { const result = await api<AuthResult>('/account/register', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }); saveCustomerToken(result.token); navigate('/tai-khoan'); }
    catch (reason) { setRegisterError(errorText(reason)); } finally { setBusy(false); }
  }
  return <section className="shell section">
    <Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: 'Tài khoản' }]} />
    <h1>Tài khoản</h1>
    <div className="contact-grid">
      <form className="panel stack" onSubmit={login}><h2>Đăng nhập</h2>
        <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
        <label>Mật khẩu<input name="password" type="password" required autoComplete="current-password" maxLength={200} /></label>
        <Message error={error} />
        <button className="button" disabled={busy}>Đăng nhập</button>
        <Link to="/tai-khoan/quen-mat-khau" className="text-button">Quên mật khẩu?</Link>
      </form>
      <form className="panel stack" onSubmit={register}><h2>Đăng ký</h2>
        <label>Họ và tên<input name="name" required autoComplete="name" maxLength={100} /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
        <label>Mật khẩu (tối thiểu 8 ký tự, gồm chữ và số)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
        <Message error={registerError} />
        <button className="button" disabled={busy}>Tạo tài khoản</button>
        <small>Tài khoản mới nhận mã <strong>WELCOME10</strong> giảm 10% cho đơn hàng đầu tiên.</small>
      </form>
    </div>
  </section>;
}

function Dashboard({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const logout = () => { clearCustomerToken(); navigate('/'); };
  return <section className="shell section">
    <Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: 'Tài khoản' }]} />
    <h1>Tài khoản của tôi</h1>
    <div className="account-layout">
      <nav className="panel account-nav" aria-label="Tài khoản">
        <NavLink to="/tai-khoan" end>Tổng quan</NavLink><NavLink to="/tai-khoan/don-hang">Đơn hàng</NavLink>
        <NavLink to="/tai-khoan/dia-chi">Địa chỉ</NavLink><NavLink to="/tai-khoan/chi-tiet">Chi tiết tài khoản</NavLink>
        <button type="button" className="text-button" onClick={logout}>Đăng xuất</button>
      </nav>
      <div className="stack">
        <Routes>
          <Route index element={<Overview customer={customer} />} />
          <Route path="don-hang" element={<Orders />} /><Route path="don-hang/:code" element={<OrderDetail />} />
          <Route path="dia-chi" element={<Addresses customer={customer} />} /><Route path="chi-tiet" element={<Details customer={customer} />} />
        </Routes>
      </div>
    </div>
  </section>;
}

function Overview({ customer }: { customer: Customer }) {
  return <div className="panel stack"><h2>Xin chào, {customer.name}!</h2>
    <p>Từ trang này bạn có thể xem <Link to="/tai-khoan/don-hang">đơn hàng</Link>, quản lý <Link to="/tai-khoan/dia-chi">địa chỉ giao hàng</Link> và cập nhật <Link to="/tai-khoan/chi-tiet">chi tiết tài khoản</Link>.</p>
    <h3>Đơn hàng gần đây</h3>
    {customer.recentOrders?.length ? <table className="orders-table"><thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th>Trạng thái</th><th>Tổng</th></tr></thead>
      <tbody>{customer.recentOrders.map(order => <tr key={order.code}><td><Link to={'/tai-khoan/don-hang/' + order.code}>{order.code}</Link></td><td>{localDate(order.createdAt)}</td><td>{labels[order.status]}</td><td>{money(order.total)}</td></tr>)}</tbody></table>
      : <p>Bạn chưa có đơn hàng nào. <Link to="/">Bắt đầu mua sắm</Link></p>}
  </div>;
}

function Orders() {
  const [rows, setRows] = useState<OrderRow[]>();
  const [error, setError] = useState('');
  useEffect(() => { api<OrderRow[]>('/account/orders').then(setRows).catch(reason => setError(errorText(reason))); }, []);
  return <div className="panel stack"><h2>Đơn hàng</h2><Message error={error} />
    {!rows ? <p role="status">Đang tải…</p> : !rows.length ? <p>Bạn chưa có đơn hàng nào.</p> :
      <div className="table-wrap"><table className="orders-table"><thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th>Trạng thái</th><th>Tổng</th><th><span className="sr-only">Chi tiết</span></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.code}><td>{row.code}</td><td>{localDate(row.createdAt)}</td><td>{labels[row.status]}{row.paymentStatus === 'PAID' ? ' · đã thanh toán' : ''}</td><td>{money(row.total)}</td>
          <td><Link to={'/tai-khoan/don-hang/' + row.code}>Xem</Link></td></tr>)}</tbody></table></div>}
  </div>;
}

function OrderDetail() {
  const { code = '' } = useParams();
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<Order>('/account/orders/' + encodeURIComponent(code)).then(setOrder).catch(reason => setError(errorText(reason)));
  useEffect(() => { void load(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  async function cancel() {
    if (!window.confirm('Hủy đơn ' + code + '?')) return;
    setBusy(true); setError('');
    try { await api('/account/orders/' + encodeURIComponent(code) + '/cancel', { method: 'POST' }); setDone('Đã hủy đơn hàng.'); await load(); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  if (!order) return <div className="panel"><Message error={error} />{!error && <p role="status">Đang tải…</p>}<Link to="/tai-khoan/don-hang">← Danh sách đơn hàng</Link></div>;
  return <div className="panel stack"><Link to="/tai-khoan/don-hang">← Danh sách đơn hàng</Link><h2>Đơn {order.code}</h2>
    <p>{labels[order.status]} · {localDate(order.createdAt)}<br />{order.customerName} · {order.phone}<br />{order.address}</p>
    {order.items.map(item => <div key={item.id} className="line"><span>{item.productName} · {item.color} / {item.size} × {item.quantity} {item.unit}</span><span>{money(item.unitPrice * item.quantity)}</span></div>)}
    <div className="totals"><span>Tiền hàng</span><span>{money(order.subtotal)}</span>
      {!!order.discount && <><span>Giảm giá ({order.couponCode})</span><span className="success">-{money(order.discount)}</span></>}
      <span>Giao hàng</span><span>{money(order.shippingFee)}</span><span>Đóng gói cá sống</span><span>{money(order.packingFee)}</span><strong>Tổng</strong><strong>{money(order.total)}</strong></div>
    <ol className="timeline">{order.history.filter(row => !row.action).map((row, index) => <li key={index}>{labels[row.toStatus]} · {localDate(row.changedAt)}</li>)}</ol>
    <Message ok={done} error={error} />
    {order.status === 'PENDING' && order.paymentStatus === 'UNPAID' && <button className="outline" disabled={busy} onClick={cancel}>Hủy đơn hàng</button>}
  </div>;
}

const emptyAddress: Address = { name: '', phone: '', province: '', district: '', ward: '', address: '' };
function AddressForm({ title, value, onSave }: { title: string; value: Address | null; onSave: (address: Address | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try { await onSave(Object.fromEntries(new FormData(event.currentTarget)) as unknown as Address); } finally { setBusy(false); }
  }
  const current = value ?? emptyAddress;
  return <form className="panel stack" onSubmit={submit} key={JSON.stringify(value)}><h2>{title}</h2>
    <label>Họ và tên<input name="name" required maxLength={100} defaultValue={current.name} /></label>
    <label>Số điện thoại<input name="phone" type="tel" required minLength={8} maxLength={20} defaultValue={current.phone} /></label>
    <div className="two"><label>Tỉnh / thành<input name="province" required maxLength={100} defaultValue={current.province} /></label><label>Quận / huyện<input name="district" required maxLength={100} defaultValue={current.district} /></label></div>
    <div className="two"><label>Phường / xã<input name="ward" maxLength={100} defaultValue={current.ward} /></label><label>Địa chỉ cụ thể<input name="address" required maxLength={200} defaultValue={current.address} /></label></div>
    <div className="cart-actions"><button className="button" disabled={busy}>Lưu địa chỉ</button>{value && <button type="button" className="outline" disabled={busy} onClick={() => void onSave(null)}>Xóa</button>}</div>
  </form>;
}

function Addresses({ customer }: { customer: Customer }) {
  const [state, setState] = useState({ shippingAddress: customer.shippingAddress, billingAddress: customer.billingAddress });
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  async function save(key: 'shippingAddress' | 'billingAddress', address: Address | null) {
    setOk(''); setError('');
    try { setState(await api<typeof state>('/account/addresses', { method: 'PUT', body: { [key]: address } })); setOk(address ? 'Đã lưu địa chỉ.' : 'Đã xóa địa chỉ.'); }
    catch (reason) { setError(errorText(reason)); }
  }
  return <><Message ok={ok} error={error} />
    <p className="muted">Địa chỉ giao hàng đã lưu sẽ tự động điền vào trang thanh toán ở lần đặt hàng sau.</p>
    <AddressForm title="Địa chỉ giao hàng" value={state.shippingAddress} onSave={address => save('shippingAddress', address)} />
    <AddressForm title="Địa chỉ thanh toán" value={state.billingAddress} onSave={address => save('billingAddress', address)} /></>;
}

function Details({ customer }: { customer: Customer }) {
  const { refresh } = useCustomer();
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [passwordOk, setPasswordOk] = useState('');
  const [passwordError, setPasswordError] = useState('');
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setOk(''); setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    try { await api('/account/me', { method: 'PATCH', body: { name: form.name, phone: form.phone, email: form.email, currentPassword: form.currentPassword || undefined } }); setOk('Đã cập nhật chi tiết tài khoản.'); await refresh(); }
    catch (reason) { setError(errorText(reason)); }
  }
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordOk(''); setPasswordError('');
    const form = event.currentTarget;
    try { await api('/account/password', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); setPasswordOk('Đã đổi mật khẩu.'); form.reset(); }
    catch (reason) { setPasswordError(errorText(reason)); }
  }
  return <><form className="panel stack" onSubmit={saveProfile}><h2>Chi tiết tài khoản</h2>
    <label>Họ và tên hiển thị<input name="name" required maxLength={100} defaultValue={customer.name} /></label>
    <label>Số điện thoại<input name="phone" type="tel" maxLength={20} defaultValue={customer.phone} /></label>
    <label>Email<input name="email" type="email" required maxLength={254} defaultValue={customer.email} /></label>
    <label>Mật khẩu hiện tại (chỉ cần khi đổi email)<input name="currentPassword" type="password" autoComplete="current-password" maxLength={200} /></label>
    <Message ok={ok} error={error} /><button className="button">Lưu thay đổi</button></form>
    <form className="panel stack" onSubmit={savePassword}><h2>Đổi mật khẩu</h2>
      <label>Mật khẩu hiện tại<input name="currentPassword" type="password" required autoComplete="current-password" maxLength={200} /></label>
      <label>Mật khẩu mới (tối thiểu 8 ký tự, gồm chữ và số)<input name="newPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
      <Message ok={passwordOk} error={passwordError} /><button className="button">Đổi mật khẩu</button></form></>;
}

export function ForgotPassword() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useSeo({ title: 'Quên mật khẩu | Long Fish', noindex: true });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try { const result = await api<{ message: string }>('/account/forgot', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }); setMessage(result.message); }
    catch (reason) { setError(errorText(reason)); }
  }
  return <section className="shell section narrow"><Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: 'Tài khoản', to: '/tai-khoan' }, { name: 'Quên mật khẩu' }]} /><h1>Quên mật khẩu</h1>
    <form className="panel stack" onSubmit={submit}><p>Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để đặt mật khẩu mới.</p>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <Message ok={message} error={error} /><button className="button">Gửi liên kết</button><Link to="/tai-khoan" className="text-button">← Quay lại đăng nhập</Link></form></section>;
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useSeo({ title: 'Đặt lại mật khẩu | Long Fish', noindex: true });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    try { const result = await api<AuthResult>('/account/reset', { method: 'POST', body: { email: params.get('email') || '', token: params.get('token') || '', password: form.password } }); saveCustomerToken(result.token); navigate('/tai-khoan'); }
    catch (reason) { setError(errorText(reason)); }
  }
  return <section className="shell section narrow"><h1>Đặt lại mật khẩu</h1>
    <form className="panel stack" onSubmit={submit}><p>Tài khoản: <strong>{params.get('email')}</strong></p>
      <label>Mật khẩu mới (tối thiểu 8 ký tự, gồm chữ và số)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
      <Message error={error} /><button className="button">Đặt mật khẩu mới</button></form></section>;
}
