import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText, labels, localDate, money, Order, query, Status } from './api';
import { applySeo, seoForPath } from './seo';
import { Dashboard } from './dashboard';
import { CouponsAdmin } from './coupons-admin';
import { ProductsAdmin } from './products-admin';
import { CustomersAdmin } from './customers-admin';
import { Drawer, Empty, Icon, OrderTank, PackingLabel, PayPill, shortDate, StatusPill, Summary, useSummary } from './admin-tools';
import './admin.css';

const tokenKey = 'longFish.adminToken';
const transitions: Record<Status, Status[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'CANCELLED'], DELIVERED: [], CANCELLED: [],
};
const nextStep: Partial<Record<Status, { to: Status; label: string }>> = {
  PENDING: { to: 'CONFIRMED', label: 'Xác nhận' }, CONFIRMED: { to: 'SHIPPING', label: 'Giao hàng' }, SHIPPING: { to: 'DELIVERED', label: 'Đã giao' },
};
const actionLabel: Record<Status, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Xác nhận đơn', SHIPPING: 'Bắt đầu giao', DELIVERED: 'Đã giao xong', CANCELLED: 'Hủy đơn' };

export function Admin() {
  const [token, setToken] = useState(sessionStorage.getItem(tokenKey) || '');
  const logout = () => { sessionStorage.removeItem(tokenKey); setToken(''); };
  useEffect(() => { const seo = seoForPath('/admin'); if (seo) applySeo(seo); }, []);
  useEffect(() => {
    window.addEventListener('admin:expired', logout);
    return () => window.removeEventListener('admin:expired', logout);
  }, []);
  if (!token) return <Login onToken={value => { sessionStorage.setItem(tokenKey, value); setToken(value); }} />;
  return <Shell token={token} logout={logout} />;
}

function Login({ onToken }: { onToken: (token: string) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      onToken((await api<{ token: string }>('/admin/login', { method: 'POST', body })).token);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <div className="ad ad-login">
    <section className="ad-login__tank" aria-hidden="true">
      <span className="ad-login__bubble" /><span className="ad-login__bubble" /><span className="ad-login__bubble" />
      <p className="ad-brand">Long Fish</p>
      <p className="ad-login__line">Quầy quản lý<br />của tiệm cá</p>
      <p className="ad-login__note">Đơn hàng, tồn kho, mã giảm giá và tin nhắn khách ở một chỗ.</p>
    </section>
    <form className="ad-login__form" onSubmit={login}>
      <h1>Đăng nhập quản trị</h1>
      <p className="ad-muted">Dùng tài khoản quản trị trong file <code>.env</code>.</p>
      <label>Tên đăng nhập<input name="username" autoComplete="username" required autoFocus /></label>
      <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert" className="ad-error">{error}</p>}
      <button className="ad-btn ad-btn--primary ad-btn--block" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <Link to="/" className="ad-link">← Về cửa hàng</Link>
    </form>
  </div>;
}

const pages = [
  { to: '/admin', label: 'Tổng quan', icon: 'home', end: true },
  { to: '/admin/orders', label: 'Đơn hàng', icon: 'orders' },
  { to: '/admin/products', label: 'Sản phẩm & kho', icon: 'fish' },
  { to: '/admin/coupons', label: 'Mã giảm giá', icon: 'ticket' },
  { to: '/admin/customers', label: 'Khách hàng', icon: 'users' },
  { to: '/admin/support', label: 'Hỗ trợ', icon: 'chat' },
];
function badgeFor(path: string, summary?: Summary) {
  if (!summary) return undefined;
  if (path === '/admin/orders' && summary.pending) return { value: summary.pending, tone: 'tag', label: 'đơn chờ xác nhận' };
  if (path === '/admin/products' && summary.lowStockCount) return { value: summary.lowStockCount, tone: 'coral', label: 'phân loại sắp hết' };
  const support = summary.openHandoffs + summary.newContacts;
  if (path === '/admin/support' && support) return { value: support, tone: 'coral', label: 'yêu cầu chưa xử lý' };
  return undefined;
}

function Shell({ token, logout }: { token: string; logout: () => void }) {
  const { summary, error, sound, toggleSound, refresh } = useSummary(token);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = [...pages].reverse().find(page => page.end ? pathname === page.to || pathname === page.to + '/' : pathname.startsWith(page.to));
  useEffect(() => { document.querySelector('.ad-main')?.scrollTo(0, 0); }, [pathname]);
  return <div className="ad ad-shell">
    <aside className="ad-side">
      <Link to="/admin" className="ad-brand">Long Fish<small>Quản trị</small></Link>
      <nav className="ad-nav" aria-label="Quản trị">
        {pages.map(page => {
          const badge = badgeFor(page.to, summary);
          return <NavLink key={page.to} to={page.to} end={page.end}>
            <Icon name={page.icon} /><span>{page.label}</span>
            {badge && <b className={'ad-count ad-count--' + badge.tone} title={badge.value + ' ' + badge.label}>{badge.value}</b>}
          </NavLink>;
        })}
      </nav>
      <div className="ad-side__foot">
        <a href="/" target="_blank" rel="noreferrer"><Icon name="store" /><span>Xem cửa hàng</span></a>
        <button type="button" onClick={logout}><Icon name="logout" /><span>Đăng xuất</span></button>
      </div>
    </aside>
    <div className="ad-main">
      <header className="ad-top">
        <div className="ad-top__title"><span className="ad-eyebrow">Long Fish</span><strong>{current?.label ?? 'Quản trị'}</strong></div>
        <form className="ad-search" role="search" onSubmit={event => {
          event.preventDefault();
          const q = String(new FormData(event.currentTarget).get('q') || '').trim();
          navigate('/admin/orders' + query({ q }));
        }}>
          <Icon name="search" /><input name="q" type="search" placeholder="Tìm đơn: mã, SĐT, tên khách" aria-label="Tìm đơn hàng" key={pathname} />
        </form>
        <Link to="/admin/orders?status=PENDING" className={'ad-chip' + (summary?.pending ? ' is-hot' : '')} aria-live="polite">
          <Icon name="bell" />{summary ? summary.pending : '–'} đơn chờ
        </Link>
        <label className="ad-switch" title="Phát tiếng 'bíp' khi có đơn mới (khi trang đang mở)">
          <input type="checkbox" checked={sound} onChange={event => void toggleSound(event.target.checked)} /><span>Âm báo</span>
        </label>
      </header>
      {error && <p className="ad-banner" role="status">{error}</p>}
      <main className="ad-body">
        <Routes>
          <Route path="/admin" element={<Dashboard token={token} summary={summary} />} />
          <Route path="/admin/orders" element={<OrdersAdmin token={token} summary={summary} onChange={() => void refresh()} />} />
          <Route path="/admin/products" element={<ProductsAdmin token={token} onChange={() => void refresh()} />} />
          <Route path="/admin/coupons" element={<CouponsAdmin token={token} />} />
          <Route path="/admin/customers" element={<CustomersAdmin token={token} />} />
          <Route path="/admin/support" element={<Support token={token} onChange={() => void refresh()} />} />
          <Route path="*" element={<Empty title="Không có trang này"><Link to="/admin">Về tổng quan</Link></Empty>} />
        </Routes>
      </main>
    </div>
  </div>;
}

const filterKeys = ['status', 'q', 'date', 'paymentStatus', 'paymentMethod', 'deliveryDate'] as const;
function OrdersAdmin({ token, summary, onChange }: { token: string; summary?: Summary; onChange: () => void }) {
  const [params, setParams] = useSearchParams();
  const filter = Object.fromEntries(filterKeys.map(key => [key, params.get(key) || ''])) as Record<typeof filterKeys[number], string>;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [orders, setOrders] = useState<Order[]>();
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Order>();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);
  const path = '/admin/orders' + query({ ...filter, page: String(page) });
  useEffect(() => { if (!done) return; const timer = window.setTimeout(() => setDone(''), 4000); return () => window.clearTimeout(timer); }, [done]);
  const extra = !!(filter.date || filter.paymentStatus || filter.paymentMethod || filter.deliveryDate);
  useEffect(() => { const timer = window.setInterval(() => setRevision(value => value + 1), 20000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<{ orders: Order[]; total: number }>(path, { token, signal: controller.signal }).then(result => {
      setOrders(result.orders); setTotal(result.total); setError('');
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [token, path, revision]);
  function update(values: Partial<Record<string, string>>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    if (!('page' in values)) next.delete('page');
    setParams(next);
  }
  async function edit(order: Order, action: 'status' | 'payment', status?: Status) {
    const confirmCancellation = order.status === 'SHIPPING' && status === 'CANCELLED';
    if (status === 'CANCELLED' && !window.confirm(confirmCancellation ? 'Hủy đơn đang giao ' + order.code + ' và hoàn tồn kho?' : 'Hủy đơn ' + order.code + '? Tồn kho và lượt dùng mã giảm giá sẽ được hoàn lại.')) return;
    setBusy(order.id); setError(''); setDone('');
    try {
      const updated = await api<Order>('/admin/orders/' + order.id + '/' + action, { token, method: 'PATCH', body: action === 'status' ? { status, confirmCancellation } : {} });
      if (selected?.id === order.id) setSelected(updated);
      setOrders(previous => previous?.map(row => row.id === updated.id ? updated : row));
      setDone(order.code + ': ' + (action === 'payment' ? 'đã ghi nhận thanh toán.' : 'đã chuyển sang “' + labels[status!] + '”.' +
        (status === 'CANCELLED' ? ' Đã hoàn tồn kho.' : '') + (status === 'DELIVERED' && updated.paymentStatus === 'PAID' && order.paymentStatus === 'UNPAID' ? ' Đã ghi nhận thu tiền COD.' : '')));
      setRevision(value => value + 1); onChange();
    } catch (reason) { setError(order.code + ': ' + errorText(reason)); }
    finally { setBusy(''); }
  }
  async function exportCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const from = String(fields.get('from')), to = String(fields.get('to'));
    const kind = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value || 'orders';
    setBusy('export'); setError('');
    try {
      const response = await fetch('/api/admin/exports/' + kind + query({ from, to }), { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error((await response.json()).message || 'Xuất CSV thất bại.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `long-fish-${kind}-${from}-${to}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(''); }
  }
  const allCount = summary ? Object.values(summary.statusCounts).reduce((sum, value) => sum + (value || 0), 0) : undefined;
  return <div className="ad-page">
    <OrderTank counts={summary?.statusCounts} active={filter.status} />
    <section className="ad-card">
      <div className="ad-toolbar">
        <div className="ad-tabs" role="tablist" aria-label="Lọc theo trạng thái">
          <button role="tab" aria-selected={!filter.status} className={!filter.status ? 'is-on' : ''} onClick={() => update({ status: '' })}>Tất cả{allCount !== undefined && <i>{allCount}</i>}</button>
          {(Object.keys(labels) as Status[]).map(status => <button key={status} role="tab" aria-selected={filter.status === status} className={filter.status === status ? 'is-on' : ''}
            onClick={() => update({ status })}>{labels[status]}{summary && <i>{summary.statusCounts[status] ?? 0}</i>}</button>)}
        </div>
        <form className="ad-search ad-search--inline" role="search" onSubmit={event => { event.preventDefault(); update({ q: String(new FormData(event.currentTarget).get('q') || '').trim() }); }}>
          <Icon name="search" /><input name="q" type="search" defaultValue={filter.q} key={filter.q} placeholder="Mã đơn, SĐT, tên, email" aria-label="Tìm trong đơn hàng" />
        </form>
      </div>
      <details className="ad-more" open={extra || undefined}>
        <summary>Lọc thêm và xuất file{extra && <b className="ad-count ad-count--tag">!</b>}</summary>
        <div className="ad-more__grid">
          <form className="ad-fields" onSubmit={event => {
            event.preventDefault(); const fields = new FormData(event.currentTarget);
            update(Object.fromEntries(['date', 'paymentStatus', 'paymentMethod', 'deliveryDate'].map(key => [key, String(fields.get(key) || '')])));
          }}>
            <label>Ngày đặt<input name="date" type="date" defaultValue={filter.date} /></label>
            <label>Ngày giao mong muốn<input name="deliveryDate" type="date" defaultValue={filter.deliveryDate} /></label>
            <label>Thanh toán<select name="paymentStatus" defaultValue={filter.paymentStatus}><option value="">Tất cả</option><option value="PAID">Đã thanh toán</option><option value="UNPAID">Chưa thanh toán</option></select></label>
            <label>Hình thức<select name="paymentMethod" defaultValue={filter.paymentMethod}><option value="">Tất cả</option><option value="COD">COD</option><option value="BANK_QR">VietQR</option></select></label>
            <div className="ad-row"><button className="ad-btn ad-btn--primary">Áp dụng</button>
              {extra && <button type="button" className="ad-btn ad-btn--ghost" onClick={() => update({ date: '', paymentStatus: '', paymentMethod: '', deliveryDate: '' })}>Bỏ lọc</button>}</div>
          </form>
          <form className="ad-fields" onSubmit={exportCsv}>
            <label>Xuất từ ngày<input name="from" type="date" required /></label>
            <label>Đến ngày<input name="to" type="date" required /></label>
            <div className="ad-row"><button className="ad-btn ad-btn--ghost" value="orders" disabled={busy === 'export'}><Icon name="download" />CSV đơn hàng</button>
              <button className="ad-btn ad-btn--ghost" value="revenue" disabled={busy === 'export'}><Icon name="download" />CSV doanh thu</button></div>
          </form>
        </div>
      </details>
      {error && !selected && <p className="ad-error" role="alert">{error}</p>}
      {done && !selected && <p className="ad-toast" role="status">{done}</p>}
      {filter.q && <p className="ad-muted ad-pad">Kết quả cho “{filter.q}” · <button className="ad-link" onClick={() => update({ q: '' })}>Xóa tìm kiếm</button></p>}
      {!orders ? <p className="ad-muted ad-pad" role="status">Đang tải đơn hàng…</p> : !orders.length ? <Empty title="Không có đơn phù hợp">Thử bỏ bớt bộ lọc hoặc tìm theo số điện thoại.</Empty> :
        <div className="ad-table-wrap"><table className="ad-table ad-table--click">
          <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Hàng</th><th>Thanh toán</th><th>Trạng thái</th><th className="num">Tổng</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>{orders.map(order => {
            const late = order.preferredDelivery && !['DELIVERED', 'CANCELLED'].includes(order.status) && Date.parse(order.preferredDelivery) < Date.now();
            const step = nextStep[order.status];
            return <tr key={order.id} onClick={() => { setError(''); setDone(''); setSelected(order); }} className={selected?.id === order.id ? 'is-sel' : ''}>
              <td><button className="ad-code" onClick={event => { event.stopPropagation(); setError(''); setDone(''); setSelected(order); }}>{order.code}</button><small>{shortDate(order.createdAt)}</small></td>
              <td><strong>{order.customerName}</strong><small>{order.phone}</small></td>
              <td><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} món</span>
                {order.hasLiveFish && <span className="ad-flag ad-flag--live">Cá sống</span>}
                {order.preferredDelivery && <small className={late ? 'ad-late' : ''}>Nhận {shortDate(order.preferredDelivery)}{late ? ' · trễ' : ''}</small>}</td>
              <td><PayPill order={order} /></td>
              <td><StatusPill status={order.status} /></td>
              <td className="num"><strong>{money(order.total)}</strong>{order.couponCode && <small>Mã {order.couponCode}</small>}</td>
              <td className="act">{step && <button className="ad-btn ad-btn--sm" disabled={busy === order.id} onClick={event => { event.stopPropagation(); void edit(order, 'status', step.to); }}>{step.label}</button>}</td>
            </tr>;
          })}</tbody></table></div>}
      <footer className="ad-pager">
        <span>{total} đơn · trang {page}/{Math.max(1, Math.ceil(total / 30))}</span>
        <div className="ad-row"><button className="ad-btn ad-btn--ghost ad-btn--sm" disabled={page === 1} onClick={() => update({ page: String(page - 1) })}>← Trước</button>
          <button className="ad-btn ad-btn--ghost ad-btn--sm" disabled={page * 30 >= total} onClick={() => update({ page: String(page + 1) })}>Sau →</button></div>
      </footer>
    </section>
    {selected && <OrderDrawer order={selected} busy={busy === selected.id} token={token} onClose={() => { setSelected(undefined); setError(''); }} edit={edit}
      notice={(error || done) ? <p role={error ? 'alert' : 'status'} className={'ad-notice ' + (error ? 'is-error' : 'is-ok')}>{error || done}</p> : null}
      onSaved={(updated, message) => { setSelected(updated); setError(''); setDone(message); setOrders(previous => previous?.map(row => row.id === updated.id ? updated : row)); }}
      onError={message => { setDone(''); setError(message); }} />}
  </div>;
}

const localInput = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(+date)) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
};
function OrderDrawer({ order, busy, token, onClose, edit, onSaved, onError, notice }: { order: Order; busy: boolean; token: string; onClose: () => void;
  edit: (order: Order, action: 'status' | 'payment', status?: Status) => Promise<void>; onSaved: (order: Order, message: string) => void;
  onError: (message: string) => void; notice: ReactNode }) {
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const editable = !['DELIVERED', 'CANCELLED'].includes(order.status);
  async function saveRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const when = String(fields.get('preferredDelivery') || '');
    setSaving(true);
    try {
      onSaved(await api<Order>('/admin/orders/' + order.id + '/details', { token, method: 'PATCH', body: {
        customerName: fields.get('customerName'), phone: fields.get('phone'), email: fields.get('email'), address: fields.get('address'),
        note: fields.get('note'), preferredDelivery: when ? new Date(when).toISOString() : '',
      } }), order.code + ': đã lưu thông tin nhận hàng.');
      setEditing(false);
    } catch (reason) { onError(errorText(reason)); }
    finally { setSaving(false); }
  }
  const flow: Status[] = ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED'];
  const reached = order.status === 'CANCELLED' ? -1 : flow.indexOf(order.status);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      onSaved(await api<Order>('/admin/orders/' + order.id + '/details', { token, method: 'PATCH',
        body: { internalNote: fields.get('internalNote'), hasLiveFish: fields.has('markLive') ? true : undefined } }), order.code + ': đã lưu ghi chú nội bộ.');
    } catch (reason) { onError(errorText(reason)); }
    finally { setSaving(false); }
  }
  return <Drawer title={order.code} subtitle={<><StatusPill status={order.status} /><PayPill order={order} /><span>Đặt lúc {localDate(order.createdAt)}</span></>} onClose={onClose}>
    {notice}
    <ol className="ad-steps" aria-label="Tiến trình đơn">
      {flow.map((status, index) => <li key={status} className={index <= reached ? 'is-done' : ''}>{labels[status]}</li>)}
      {order.status === 'CANCELLED' && <li className="is-cancel">Đã hủy</li>}
    </ol>
    {(transitions[order.status].length > 0 || (order.paymentStatus === 'UNPAID' && order.status !== 'CANCELLED')) && <div className="ad-actions">
      {transitions[order.status].map(status => <button key={status} disabled={busy} onClick={() => void edit(order, 'status', status)}
        className={'ad-btn ' + (status === 'CANCELLED' ? 'ad-btn--danger' : 'ad-btn--primary')}>{actionLabel[status]}</button>)}
      {order.paymentStatus === 'UNPAID' && order.status !== 'CANCELLED' && <button className="ad-btn ad-btn--ghost" disabled={busy} onClick={() => void edit(order, 'payment')}>Ghi nhận đã thanh toán</button>}
    </div>}
    <section className="ad-block">
      <div className="ad-block__head"><h3>Người nhận</h3>
        {editable && <button type="button" className="ad-link" onClick={() => setEditing(value => !value)} aria-expanded={editing}>{editing ? 'Hủy sửa' : 'Sửa thông tin nhận hàng'}</button>}</div>
      {editing ? <form key={order.id + order.history.length} className="form-grid" onSubmit={event => void saveRecipient(event)}>
        <label>Tên người nhận<input name="customerName" required maxLength={100} defaultValue={order.customerName} /></label>
        <label>Số điện thoại<input name="phone" required maxLength={25} defaultValue={order.phone} inputMode="tel" /></label>
        <label className="full">Email (để trống nếu không có)<input name="email" type="email" maxLength={200} defaultValue={order.email} /></label>
        <label className="full">Địa chỉ giao hàng<textarea name="address" required maxLength={400} rows={2} defaultValue={order.address} /></label>
        <label>Giờ nhận mong muốn<input name="preferredDelivery" type="datetime-local" defaultValue={localInput(order.preferredDelivery)} /></label>
        <label>Ghi chú giao hàng<input name="note" maxLength={500} defaultValue={order.note} /></label>
        <p className="full ad-muted">Đổi tỉnh/thành không tự tính lại phí giao. Nếu phí thay đổi, hãy hủy đơn và đặt lại.</p>
        <div className="full ad-row"><button className="ad-btn ad-btn--primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thông tin nhận hàng'}</button></div>
      </form> : <>
      <p><strong>{order.customerName}</strong> · <a href={'tel:' + order.phone}>{order.phone}</a>{order.email && <> · <a href={'mailto:' + order.email}>{order.email}</a></>}</p>
      <p>{order.address}</p>
      {order.preferredDelivery && <p>Giờ nhận mong muốn: <strong>{localDate(order.preferredDelivery)}</strong></p>}
      <p>Vận chuyển: {order.shippingMethod === 'EXPRESS' ? 'Giao nhanh' : 'Giao tiêu chuẩn'}</p>
      {order.note && <p className="ad-quote">{order.note}</p>}
      {order.hasLiveFish && <p><span className="ad-flag ad-flag--live">Cá sống · ưu tiên đóng gói</span></p>}
      </>}
    </section>
    <section className="ad-block">
      <h3>Hàng trong đơn</h3>
      <ul className="ad-items">{order.items.map(item => <li key={item.id}>
        <span><strong>{item.productName}</strong><small>{item.color} / {item.size} / {item.gender}</small></span>
        <span className="num">{item.quantity} {item.unit} × {money(item.unitPrice)}<strong>{money(item.unitPrice * item.quantity)}</strong></span>
      </li>)}</ul>
      <dl className="ad-totals">
        <dt>Tiền hàng</dt><dd>{money(order.subtotal)}</dd>
        {!!order.discount && <><dt>Mã {order.couponCode}</dt><dd>−{money(order.discount)}</dd></>}
        <dt>Phí giao</dt><dd>{money(order.shippingFee)}</dd>
        {!!order.packingFee && <><dt>Đóng gói cá sống</dt><dd>{money(order.packingFee)}</dd></>}
        <dt className="is-total">Tổng</dt><dd className="is-total">{money(order.total)}</dd>
      </dl>
    </section>
    <section className="ad-block">
      <h3>Ghi chú nội bộ</h3>
      <form key={order.id} className="ad-fields ad-fields--one" onSubmit={save}>
        <label className="sr-only" htmlFor="ad-note">Ghi chú nội bộ</label>
        <textarea id="ad-note" name="internalNote" rows={3} defaultValue={order.internalNote} maxLength={600} placeholder="Chỉ nhân viên thấy, ví dụ: khách hẹn gọi trước 30 phút" />
        {!order.hasLiveFish && <label className="ad-check"><input name="markLive" type="checkbox" /> Đánh dấu ưu tiên cá sống</label>}
        <div className="ad-row"><button className="ad-btn ad-btn--ghost" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu ghi chú'}</button><PackingLabel order={order} /></div>
      </form>
    </section>
    <section className="ad-block">
      <h3>Lịch sử</h3>
      <ol className="ad-history">{[...order.history].reverse().map((row, index) => <li key={row.id || index}>
        <time>{localDate(row.changedAt)}</time>
        <span>{row.action === 'note' ? row.detail : row.action === 'payment' ? 'Ghi nhận đã thanh toán' : labels[row.toStatus]}</span>
      </li>)}</ol>
    </section>
  </Drawer>;
}

type Handoff = { id: string; psid: string; lastMessage: string; reason: string; status: 'OPEN' | 'DONE'; createdAt: string };
type Contact = { id: string; name: string; email: string; message: string; status: 'NEW' | 'DONE'; createdAt: string };
function Support({ token, onChange }: { token: string; onChange: () => void }) {
  const [handoffs, setHandoffs] = useState<Handoff[]>();
  const [contacts, setContacts] = useState<Contact[]>();
  const [tab, setTab] = useState<'messenger' | 'contact'>('messenger');
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  useEffect(() => {
    api<Handoff[]>('/admin/handoffs', { token }).then(setHandoffs).catch(reason => setError(errorText(reason)));
    api<Contact[]>('/admin/contacts', { token }).then(setContacts).catch(reason => setError(errorText(reason)));
  }, [token]);
  async function finish(kind: 'handoffs' | 'contacts', id: string) {
    setPending(id); setError('');
    try {
      const row = await api<Handoff & Contact>('/admin/' + kind + '/' + id, { token, method: 'PATCH', body: { status: 'DONE' } });
      if (kind === 'handoffs') setHandoffs(previous => previous?.map(item => item.id === id ? row : item));
      else setContacts(previous => previous?.map(item => item.id === id ? row : item));
      onChange();
    } catch (reason) { setError(errorText(reason)); }
    finally { setPending(''); }
  }
  const openHandoffs = handoffs?.filter(row => row.status === 'OPEN').length ?? 0;
  const newContacts = contacts?.filter(row => row.status === 'NEW').length ?? 0;
  const handoffRows = handoffs?.filter(row => showDone || row.status === 'OPEN');
  const contactRows = contacts?.filter(row => showDone || row.status === 'NEW');
  return <div className="ad-page">
    <div className="ad-head">
      <div><h1>Hỗ trợ khách</h1><p className="ad-muted">Khách cần người thật trả lời trên Messenger và tin gửi từ trang Liên hệ.</p></div>
      <label className="ad-switch"><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)} /><span>Hiện cả mục đã xử lý</span></label>
    </div>
    <div className="ad-tabs ad-tabs--big" role="tablist">
      <button role="tab" aria-selected={tab === 'messenger'} className={tab === 'messenger' ? 'is-on' : ''} onClick={() => setTab('messenger')}>Messenger<i>{openHandoffs}</i></button>
      <button role="tab" aria-selected={tab === 'contact'} className={tab === 'contact' ? 'is-on' : ''} onClick={() => setTab('contact')}>Trang Liên hệ<i>{newContacts}</i></button>
    </div>
    {error && <p className="ad-error" role="alert">{error}</p>}
    {tab === 'messenger' ? <div className="ad-feed">
      {!handoffRows ? <p className="ad-muted">Đang tải…</p> : !handoffRows.length ? <Empty title="Không có khách nào đang chờ">Bot đang tự trả lời. Khi khách nhắn "gặp nhân viên" hoặc bot không hiểu nhiều lần, yêu cầu sẽ hiện ở đây.</Empty> :
        handoffRows.map(row => <article key={row.id} className={'ad-msg' + (row.status === 'OPEN' ? ' is-open' : '')}>
          <header><strong>Khách Messenger</strong><span className="ad-muted">PSID {row.psid}</span><time>{localDate(row.createdAt)}</time></header>
          <p className="ad-quote">{row.lastMessage || '(không có nội dung)'}</p>
          <footer><span className="ad-flag">{row.reason}</span>
            {row.status === 'OPEN' ? <div className="ad-row">
              <a className="ad-btn ad-btn--ghost ad-btn--sm" href="https://business.facebook.com/latest/inbox" target="_blank" rel="noreferrer">Mở hộp thư Meta</a>
              <button className="ad-btn ad-btn--primary ad-btn--sm" disabled={pending === row.id} onClick={() => void finish('handoffs', row.id)}>Xong, bật lại bot</button>
            </div> : <span className="ad-ok">Đã xử lý</span>}</footer>
        </article>)}
    </div> : <div className="ad-feed">
      {!contactRows ? <p className="ad-muted">Đang tải…</p> : !contactRows.length ? <Empty title="Không có tin mới">Tin khách gửi từ trang Liên hệ sẽ hiện ở đây.</Empty> :
        contactRows.map(row => <article key={row.id} className={'ad-msg' + (row.status === 'NEW' ? ' is-open' : '')}>
          <header><strong>{row.name}</strong><a href={'mailto:' + row.email}>{row.email}</a><time>{localDate(row.createdAt)}</time></header>
          <p className="ad-quote" style={{ whiteSpace: 'pre-wrap' }}>{row.message}</p>
          <footer>{row.status === 'NEW' ? <div className="ad-row">
            <a className="ad-btn ad-btn--ghost ad-btn--sm" href={'mailto:' + row.email + '?subject=' + encodeURIComponent('Long Fish trả lời liên hệ của bạn')}>Trả lời qua email</a>
            <button className="ad-btn ad-btn--primary ad-btn--sm" disabled={pending === row.id} onClick={() => void finish('contacts', row.id)}>Đánh dấu đã xử lý</button>
          </div> : <span className="ad-ok">Đã xử lý</span>}</footer>
        </article>)}
    </div>}
  </div>;
}
