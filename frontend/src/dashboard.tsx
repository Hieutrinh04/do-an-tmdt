import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorText, money, Order, query } from './api';
import { compact, Empty, OrderTank, shortDate, StatusPill, Summary, vnDay } from './admin-tools';

type Point = { period: string; revenue: number; orders?: number };
type Stats = { todayRevenue: number; monthRevenue: number; daily: Point[]; monthly: Point[];
  total: { orders: number; revenue: number; delivered: number; processing: number; cancelled: number };
  categories: { name: string; revenue: number }[];
  top: { id: string; name: string; quantity: number; revenue: number }[];
};

const axis = { fontSize: 11, fill: '#5d7570' };
function RevenueTip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: Point }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="ad-tip"><small>{label}</small><strong>{money(payload[0].value)}</strong>{payload[0].payload.orders !== undefined && <small>{payload[0].payload.orders} đơn đặt</small>}</div>;
}

export function Dashboard({ token, summary }: { token: string; summary?: Summary }) {
  const [stats, setStats] = useState<Stats>();
  const [recent, setRecent] = useState<Order[]>();
  const [range, setRange] = useState({ from: '', to: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api<Stats>('/admin/stats/overview' + query(range), { token, signal: controller.signal }).then(setStats)
      .catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [token, range]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ orders: Order[] }>('/admin/orders', { token, signal: controller.signal }).then(result => setRecent(result.orders.slice(0, 6))).catch(() => setRecent([]));
    return () => controller.abort();
  }, [token, summary?.latestId]);
  const changeRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setRange({ from: String(fields.get('from')), to: String(fields.get('to')) });
  };
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const total = stats?.total;
  const average = total?.delivered ? Math.round(total.revenue / total.delivered) : 0;
  const cancelRate = total?.orders ? Math.round(total.cancelled / total.orders * 100) : 0;
  const topMax = Math.max(1, ...(stats?.top.map(row => row.quantity) ?? [1]));
  const catMax = Math.max(1, ...(stats?.categories.map(row => row.revenue) ?? [1]));
  const rangeText = range.from || range.to ? (range.from || '…') + ' → ' + (range.to || 'hôm nay') : '30 ngày gần nhất';
  return <div className="ad-page">
    <div className="ad-head">
      <div><h1>{greeting}!</h1>
        <p className="ad-muted">{summary ? summary.pending ? <>Có <strong>{summary.pending} đơn</strong> đang chờ xác nhận{summary.lowStockCount ? <> và <strong>{summary.lowStockCount} phân loại</strong> sắp hết hàng</> : null}.</> : 'Không có đơn nào đang chờ. Bể yên ả.' : 'Đang tải số liệu…'}</p></div>
      <form className="ad-range" onSubmit={changeRange} aria-label="Khoảng thống kê">
        <label>Từ<input type="date" name="from" max={vnDay()} /></label><label>Đến<input type="date" name="to" max={vnDay()} /></label>
        <button className="ad-btn ad-btn--ghost ad-btn--sm">Xem</button>
        {(range.from || range.to) && <button type="reset" className="ad-link" onClick={() => setRange({ from: '', to: '' })}>30 ngày gần nhất</button>}
      </form>
    </div>
    <OrderTank counts={summary?.statusCounts} />
    {error && <p role="alert" className="ad-error">{error}</p>}
    <div className="ad-kpis">
      <div className="ad-kpi ad-kpi--lead"><span>Doanh thu hôm nay</span><strong>{stats ? money(stats.todayRevenue) : '–'}</strong><small>Đơn đã giao, đặt hôm nay</small></div>
      <div className="ad-kpi"><span>Tháng này</span><strong>{stats ? money(stats.monthRevenue) : '–'}</strong><small>Từ ngày 1 đến nay</small></div>
      <div className="ad-kpi"><span>Đơn đặt · {rangeText}</span><strong>{total ? total.orders : '–'}</strong><small>{total ? total.delivered + ' đã giao · ' + total.processing + ' đang xử lý' : ''}</small></div>
      <div className="ad-kpi"><span>Giá trị TB đơn đã giao</span><strong>{total ? money(average) : '–'}</strong><small>Tỉ lệ hủy {total ? cancelRate + '%' : '–'}</small></div>
    </div>
    <div className="ad-grid ad-grid--chart">
      <section className="ad-card">
        <header className="ad-card__head"><h2>Doanh thu 30 ngày</h2><small>Chỉ tính đơn đã giao, theo ngày đặt</small></header>
        <div className="ad-chart">{stats ? <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats.daily} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs><linearGradient id="adWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b8f86" stopOpacity={0.45} /><stop offset="100%" stopColor="#2b8f86" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#e1ece7" />
            <XAxis dataKey="period" tickFormatter={value => value.slice(8) + '/' + value.slice(5, 7)} minTickGap={22} tick={axis} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compact} tick={axis} width={46} axisLine={false} tickLine={false} />
            <Tooltip content={<RevenueTip />} cursor={{ stroke: '#9fc4b8' }} />
            <Area type="monotone" dataKey="revenue" stroke="#1f6f68" strokeWidth={2.2} fill="url(#adWater)" />
          </AreaChart></ResponsiveContainer> : <div className="ad-skel" />}</div>
      </section>
      <section className="ad-card">
        <header className="ad-card__head"><h2>12 tháng</h2><small>Doanh thu theo tháng</small></header>
        <div className="ad-chart">{stats ? <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.monthly} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e1ece7" />
            <XAxis dataKey="period" tickFormatter={value => 'T' + Number(value.slice(5))} tick={axis} axisLine={false} tickLine={false} interval={0} />
            <YAxis tickFormatter={compact} tick={axis} width={46} axisLine={false} tickLine={false} />
            <Tooltip content={<RevenueTip />} cursor={{ fill: '#eef5f2' }} />
            <Bar dataKey="revenue" fill="#1f5c46" radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart></ResponsiveContainer> : <div className="ad-skel" />}</div>
      </section>
    </div>
    <div className="ad-grid">
      <section className="ad-card">
        <header className="ad-card__head"><h2>Đơn mới nhất</h2><Link className="ad-link" to="/admin/orders">Tất cả đơn →</Link></header>
        {!recent ? <div className="ad-skel ad-skel--list" /> : !recent.length ? <Empty title="Chưa có đơn nào" /> :
          <ul className="ad-list">{recent.map(order => <li key={order.id}>
            <Link to={'/admin/orders?q=' + order.code}><span><strong>{order.code}</strong><small>{order.customerName} · {shortDate(order.createdAt)}</small></span>
              <span className="ad-list__end"><StatusPill status={order.status} /><b>{money(order.total)}</b></span></Link>
          </li>)}</ul>}
      </section>
      <section className="ad-card">
        <header className="ad-card__head"><h2>Sắp hết hàng</h2><Link className="ad-link" to="/admin/products?stock=low">Nhập kho →</Link></header>
        {!summary ? <div className="ad-skel ad-skel--list" /> : !summary.lowStock.length ? <Empty title="Kho đủ hàng">Không phân loại nào chạm ngưỡng cảnh báo.</Empty> :
          <ul className="ad-list">{summary.lowStock.slice(0, 6).map(row => <li key={row.id}>
            <Link to={'/admin/products?q=' + encodeURIComponent(row.product.name)}><span><strong>{row.product.name}</strong><small>{row.color} / {row.size} · {row.sku}</small></span>
              <span className="ad-list__end"><span className={'ad-stock' + (row.stock === 0 ? ' is-out' : '')}>{row.stock === 0 ? 'Hết hàng' : 'Còn ' + row.stock + ' ' + row.unit}</span></span></Link>
          </li>)}</ul>}
      </section>
    </div>
    <div className="ad-grid">
      <section className="ad-card">
        <header className="ad-card__head"><h2>Bán chạy</h2><small>{rangeText} · số lượng đã giao</small></header>
        {!stats ? <div className="ad-skel ad-skel--list" /> : !stats.top.length ? <Empty title="Chưa có sản phẩm đã giao trong khoảng này" /> :
          <ol className="ad-bars">{stats.top.map((row, index) => <li key={row.id}>
            <span className="ad-bars__rank">{index + 1}</span>
            <span className="ad-bars__name">{row.name}<small>{money(row.revenue)}</small></span>
            <span className="ad-bars__track"><span style={{ width: Math.max(4, row.quantity / topMax * 100) + '%' }} /></span>
            <b>{row.quantity}</b>
          </li>)}</ol>}
      </section>
      <section className="ad-card">
        <header className="ad-card__head"><h2>Theo danh mục</h2><small>Tiền hàng đơn đã giao</small></header>
        {!stats ? <div className="ad-skel ad-skel--list" /> : !stats.categories.length ? <Empty title="Chưa có doanh thu trong khoảng này" /> :
          <ol className="ad-bars ad-bars--cat">{stats.categories.map(row => <li key={row.name}>
            <span className="ad-bars__name">{row.name}</span>
            <span className="ad-bars__track"><span style={{ width: Math.max(4, row.revenue / catMax * 100) + '%' }} /></span>
            <b>{compact(row.revenue)}</b>
          </li>)}</ol>}
      </section>
    </div>
  </div>;
}
