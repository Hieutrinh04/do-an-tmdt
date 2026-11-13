import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText, money, query } from './api';
import { Empty, Icon, shortDate } from './admin-tools';

type Customer = { key: string; name: string; phone: string; email: string; hasAccount: boolean; accountCreatedAt: string | null; orders: number;
  delivered: number; cancelled: number; open: number; spent: number; lastOrderAt: string | null; lastCode: string };
type Result = { total: number; accounts: number; customers: Customer[] };

const sorts = { recent: 'Mới đặt gần đây', spent: 'Chi tiêu nhiều nhất', orders: 'Nhiều đơn nhất' } as const;
const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();

export function CustomersAdmin({ token }: { token: string }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<keyof typeof sorts>('recent');
  const [only, setOnly] = useState<'' | 'account' | 'repeat'>('');
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setSearch(q.trim()), 300); return () => window.clearTimeout(timer); }, [q]);
  useEffect(() => {
    const controller = new AbortController();
    api<Result>('/admin/customers' + query({ q: search }), { token, signal: controller.signal }).then(value => { setResult(value); setError(''); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [token, search]);
  const rows = (result?.customers ?? []).filter(row => only === 'account' ? row.hasAccount : only === 'repeat' ? row.orders >= 2 : true)
    .sort((a, b) => sort === 'spent' ? b.spent - a.spent : sort === 'orders' ? b.orders - a.orders : 0);
  const repeat = result?.customers.filter(row => row.orders >= 2).length ?? 0;
  const spent = result?.customers.reduce((sum, row) => sum + row.spent, 0) ?? 0;
  return <div className="ad-page">
    <div className="ad-head"><div><h1>Khách hàng</h1><p className="ad-muted">Gộp theo tài khoản, hoặc theo số điện thoại với khách đặt không cần tài khoản.</p></div></div>
    <div className="ad-kpis">
      <div className="ad-kpi"><span>Khách đã mua / đăng ký</span><strong>{result ? result.total : '–'}</strong><small>{search ? 'Theo tìm kiếm hiện tại' : 'Toàn bộ'}</small></div>
      <div className="ad-kpi"><span>Có tài khoản</span><strong>{result ? result.accounts : '–'}</strong><small>Đăng ký tại /tai-khoan</small></div>
      <div className="ad-kpi"><span>Khách quay lại</span><strong>{result ? repeat : '–'}</strong><small>Từ 2 đơn trở lên</small></div>
      <div className="ad-kpi"><span>Tổng đã chi</span><strong>{result ? money(spent) : '–'}</strong><small>Đơn đã giao</small></div>
    </div>
    <section className="ad-card">
      <div className="ad-toolbar">
        <div className="ad-tabs" role="tablist">
          {([['', 'Tất cả'], ['account', 'Có tài khoản'], ['repeat', 'Quay lại']] as const).map(([value, label]) =>
            <button key={value} role="tab" aria-selected={only === value} className={only === value ? 'is-on' : ''} onClick={() => setOnly(value)}>{label}</button>)}
        </div>
        <div className="ad-row">
          <select className="ad-select" aria-label="Sắp xếp" value={sort} onChange={event => setSort(event.target.value as keyof typeof sorts)}>
            {Object.entries(sorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <div className="ad-search ad-search--inline"><Icon name="search" /><input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder="Tên, SĐT hoặc email" aria-label="Tìm khách hàng" /></div>
        </div>
      </div>
      {error && <p className="ad-error" role="alert">{error}</p>}
      {!result ? <p className="ad-muted ad-pad" role="status">Đang tải khách hàng…</p> : !rows.length ? <Empty title="Không có khách phù hợp">Thử tìm bằng số điện thoại đặt hàng.</Empty> :
        <div className="ad-table-wrap"><table className="ad-table">
          <thead><tr><th>Khách hàng</th><th>Liên hệ</th><th>Đơn</th><th className="num">Đã chi</th><th>Đơn gần nhất</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.key}>
            <td><div className="ad-prod"><span className="ad-avatar" aria-hidden="true">{initials(row.name) || '?'}</span>
              <span><strong>{row.name}</strong>{row.hasAccount ? <small className="ad-ok">Có tài khoản{row.accountCreatedAt ? ' · từ ' + new Date(row.accountCreatedAt).toLocaleDateString('vi-VN') : ''}</small> : <small>Khách vãng lai</small>}</span></div></td>
            <td><a href={'tel:' + row.phone}>{row.phone || '—'}</a>{row.email && <small><a href={'mailto:' + row.email}>{row.email}</a></small>}</td>
            <td className="ad-nowrap"><strong>{row.orders}</strong>{row.orders > 0 && <small>{row.delivered} giao · {row.open} đang xử lý{row.cancelled ? ' · ' + row.cancelled + ' hủy' : ''}</small>}</td>
            <td className="num"><strong>{money(row.spent)}</strong></td>
            <td className="ad-nowrap">{row.lastOrderAt ? <><Link className="ad-link" to={'/admin/orders?q=' + encodeURIComponent(row.phone || row.lastCode)}>{row.lastCode}</Link><small>{shortDate(row.lastOrderAt)}</small></> : <small>Chưa đặt đơn</small>}</td>
          </tr>)}</tbody></table></div>}
      {result && result.total > result.customers.length && <p className="ad-muted ad-pad">Đang hiện {result.customers.length}/{result.total} khách. Tìm theo tên hoặc SĐT để thu hẹp.</p>}
    </section>
  </div>;
}
