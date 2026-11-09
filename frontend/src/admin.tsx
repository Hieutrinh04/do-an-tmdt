import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api, errorText, labels, localDate, money, Order, query, Status } from './api';
import { Dashboard } from './dashboard';
import { ProductsAdmin } from './products-admin';
import { AdminAlerts, PackingLabel } from './admin-tools';

type AdminProps = { token: string };
const tokenKey = 'longFish.adminToken';
const transitions: Record<Status, Status[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'CANCELLED'], DELIVERED: [], CANCELLED: [],
};

export function Admin() {
  const [token, setToken] = useState(sessionStorage.getItem(tokenKey) || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const logout = () => { sessionStorage.removeItem(tokenKey); setToken(''); };
  useEffect(() => {
    window.addEventListener('admin:expired', logout);
    return () => window.removeEventListener('admin:expired', logout);
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const result = await api<{ token: string }>('/admin/login', { method: 'POST', body });
      sessionStorage.setItem(tokenKey, result.token);
      setToken(result.token);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <section className={'shell section ' + (token ? '' : 'narrow')}>
    <p className="eyebrow">LONG FISH</p><h1>{token ? 'Quản trị cửa hàng' : 'Đăng nhập quản trị'}</h1>
    {!token ? <form className="panel stack" onSubmit={login}>
      <label>Tên đăng nhập<input name="username" autoComplete="username" required /></label>
      <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert" className="error">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form> : <>
      <nav className="admin-nav" aria-label="Quản trị">
        <NavLink end to="/admin">Tổng quan</NavLink><NavLink to="/admin/orders">Đơn hàng</NavLink>
        <NavLink to="/admin/products">Sản phẩm</NavLink><NavLink to="/admin/support">Hỗ trợ</NavLink>
        <button className="text-button" onClick={logout}>Đăng xuất</button>
      </nav>
      <AdminAlerts token={token} />
      <Routes>
        <Route index element={<Dashboard token={token} />} />
        <Route path="orders" element={<OrdersAdmin token={token} />} />
        <Route path="products" element={<ProductsAdmin token={token} />} />
        <Route path="support" element={<Support token={token} />} />
        <Route path="*" element={<Link to="/admin">Về tổng quan</Link>} />
      </Routes>
    </>}
  </section>;
}

function OrdersAdmin({ token }: AdminProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState({ status: '', date: '', q: '', paymentStatus:'', paymentMethod:'', deliveryDate:'' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Order>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const path = '/admin/orders' + query({ ...filter, page: String(page) });
  useEffect(()=>{const timer=window.setInterval(()=>setRevision(value=>value+1),20000);return()=>window.clearInterval(timer);},[]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ orders: Order[]; total: number }>(path, { token, signal: controller.signal }).then(result => {
      setOrders(result.orders); setTotal(result.total);
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [token, path, revision]);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPage(1); setError(''); setFilter({ status: String(fields.get('status')), date: String(fields.get('date')), q: String(fields.get('q')),
      paymentStatus:String(fields.get('paymentStatus')),paymentMethod:String(fields.get('paymentMethod')),deliveryDate:String(fields.get('deliveryDate')) });
  }
  async function edit(order: Order, action: 'status' | 'payment', status?: Status) {
    const confirmCancellation = order.status === 'SHIPPING' && status === 'CANCELLED';
    if (confirmCancellation && !window.confirm('Hủy đơn đang giao và hoàn tồn kho?')) return;
    setBusy(true); setError('');
    try {
      const updated = await api<Order>('/admin/orders/' + order.id + '/' + action, {
        token, method: 'PATCH', body: action === 'status' ? { status, confirmCancellation } : {},
      });
      setSelected(updated); setRevision(value => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  return <div className="stack">
    <h2>Đơn hàng</h2>
    <form className="panel form-grid" onSubmit={apply}>
      <label>Trạng thái<select name="status"><option value="">Tất cả</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Ngày đặt<input name="date" type="date" /></label><label>Mã đơn / điện thoại<input name="q" /></label>
      <label>Thanh toán<select name="paymentStatus"><option value="">Tất cả</option><option value="PAID">Đã thanh toán</option><option value="UNPAID">Chưa thanh toán</option></select></label>
      <label>Hình thức<select name="paymentMethod"><option value="">Tất cả</option><option value="COD">COD</option><option value="BANK_QR">VietQR</option></select></label>
      <label>Ngày giao mong muốn<input name="deliveryDate" type="date" /></label>
      <button className="button self-end">Lọc đơn</button>
    </form>
    <form className="panel form-grid" onSubmit={async event=>{
      event.preventDefault();const fields=new FormData(event.currentTarget);const from=String(fields.get('from')),to=String(fields.get('to'));
      const kind=((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value||'orders';setBusy(true);setError('');
      try{const response=await fetch('/api/admin/exports/'+kind+query({from,to}),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new Error((await response.json()).message||'Xuất CSV thất bại.');
        const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=`long-fish-${kind}-${from}-${to}.csv`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(reason){setError(errorText(reason));}finally{setBusy(false);}
    }}><label>Xuất từ ngày<input name="from" type="date" required/></label><label>Xuất đến ngày<input name="to" type="date" required/></label>
      <button className="outline" value="orders" disabled={busy}>Xuất CSV đơn</button><button className="outline" value="revenue" disabled={busy}>Xuất CSV doanh thu</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="panel table-scroll"><table><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Ngày đặt</th><th>Trạng thái</th><th>Tổng</th></tr></thead>
      <tbody>{orders.map(order => <tr key={order.id}>
        <td><button className="text-button" disabled={busy} onClick={() => setSelected(order)}>{order.code}</button></td>
        <td>{order.customerName} {order.hasLiveFish && <span className="badge order-live">Cá sống</span>}<small>{order.phone}</small>
        {order.preferredDelivery&&<small className={!['DELIVERED','CANCELLED'].includes(order.status)&&Date.parse(order.preferredDelivery)<Date.now()?'error':''}>Giờ nhận mong muốn: {localDate(order.preferredDelivery)}</small>}</td><td>{localDate(order.createdAt)}</td><td>{labels[order.status]}</td><td>{money(order.total)}</td>
      </tr>)}</tbody></table>{!orders.length && <p>Không có đơn phù hợp.</p>}</div>
    <div className="line"><button className="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Trang trước</button>
      <small>Trang {page} · {total} đơn</small><button className="outline" disabled={page * 30 >= total} onClick={() => setPage(page + 1)}>Trang sau</button></div>
    {selected && <article className="panel stack" aria-label="Chi tiết đơn">
      <div className="line"><h3>{selected.code}</h3><button className="outline" disabled={busy} onClick={() => setSelected(undefined)}>Đóng</button></div>
      <p>{selected.customerName} · {selected.phone}<br />{selected.address}</p>
      {selected.hasLiveFish && <p><span className="badge order-live">Cá sống · Ưu tiên đóng gói</span></p>}
      {selected.preferredDelivery && <p>Giờ nhận mong muốn · {localDate(selected.preferredDelivery)}</p>}
      {selected.note && <p>Ghi chú nhận hàng · {selected.note}</p>}
      {selected.items.map(item => <div className="line" key={item.id}><span>{item.productName} · {item.color} / {item.size} / {item.gender} × {item.quantity} {item.unit}</span><span>{money(item.unitPrice * item.quantity)}</span></div>)}
      <div className="totals"><span>Tiền hàng</span><span>{money(selected.subtotal)}</span><span>Phí giao</span><span>{money(selected.shippingFee)}</span><span>Đóng gói cá sống</span><span>{money(selected.packingFee)}</span><strong>Tổng</strong><strong>{money(selected.total)}</strong></div>
      <p>{selected.paymentMethod === 'COD' ? 'COD' : 'VietQR'} · {selected.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</p>
      <h4>Lịch sử thay đổi</h4>{selected.history.map((row,index) => <small key={row.id||index}>{localDate(row.changedAt)} · {row.action==='note'?row.detail:row.action==='payment'?'Ghi nhận đã thanh toán':labels[row.toStatus]}</small>)}
      <PackingLabel order={selected}/>
      <form key={selected.id} className="stack" onSubmit={async event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        setBusy(true); setError('');
        try {
          const updated = await api<Order>('/admin/orders/' + selected.id + '/details', { token, method: 'PATCH',
            body: { internalNote: fields.get('internalNote'), hasLiveFish: fields.has('markLive') ? true : undefined } });
          setSelected(updated); setRevision(value => value + 1);
        } catch (reason) { setError(errorText(reason)); }
        finally { setBusy(false); }
      }}>
        <label>Ghi chú nội bộ<textarea name="internalNote" defaultValue={selected.internalNote} maxLength={600} /></label>
        {!selected.hasLiveFish && <label className="radio"><input name="markLive" type="checkbox" /> Đánh dấu ưu tiên cá sống</label>}
        <button className="outline" disabled={busy}>Lưu ghi chú</button>
      </form>
      <div className="filters">{transitions[selected.status].map(status =>
        <button key={status} disabled={busy} onClick={() => edit(selected, 'status', status)}>{labels[status]}</button>)}
        {selected.paymentStatus === 'UNPAID' && selected.status !== 'CANCELLED' && <button disabled={busy} onClick={() => edit(selected, 'payment')}>Đánh dấu đã thanh toán</button>}
      </div>
    </article>}
  </div>;
}

type Handoff = { id: string; psid: string; lastMessage: string; reason: string; status: 'OPEN' | 'DONE'; createdAt: string };
function Support({ token }: AdminProps) {
  const [rows, setRows] = useState<Handoff[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  useEffect(() => { api<Handoff[]>('/admin/handoffs', { token }).then(setRows).catch(reason => setError(errorText(reason))); }, [token]);
  async function finish(id: string) {
    setPending(id); setError('');
    try {
      const row = await api<Handoff>('/admin/handoffs/' + id, { token, method: 'PATCH', body: { status: 'DONE' } });
      setRows(previous => previous.map(item => item.id === id ? row : item));
    } catch (reason) { setError(errorText(reason)); }
    finally { setPending(''); }
  }
  return <div className="stack"><h2>Hỗ trợ Messenger</h2>{error && <p className="error" role="alert">{error}</p>}
    {!rows.length && <p>Chưa có yêu cầu hỗ trợ.</p>}
    {rows.map(row => <article className="panel stack" key={row.id}><div className="line"><strong>PSID {row.psid}</strong><span className="badge">{row.status === 'OPEN' ? 'Đang chờ' : 'Đã xử lý'}</span></div>
      <small>{localDate(row.createdAt)} · {row.reason}</small><p>{row.lastMessage}</p>
      {row.status === 'OPEN' && <button className="button" disabled={!!pending} onClick={() => finish(row.id)}>Hoàn tất và bật lại bot</button>}
    </article>)}
  </div>;
}
