import { FormEvent, useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorText, money, query } from './api';

type Point = { period: string; revenue: number };
type Stats = { todayRevenue: number; monthRevenue: number; daily: Point[]; monthly: Point[];
  total: { delivered: number; processing: number; cancelled: number };
  categories: { name: string; revenue: number }[];
  top: { id: string; name: string; quantity: number; revenue: number }[];
};

function Chart({ title, rows }: { title: string; rows: Point[] }) {
  return <article className="panel"><h3>{title}</h3><div className="chart">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d4e8e9" />
        <XAxis dataKey="period" tickFormatter={value => value.slice(5)} minTickGap={24} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={value => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value)} tick={{ fontSize: 11 }} width={54} />
        <Tooltip formatter={value => [money(Number(value)), 'Doanh thu']} />
        <Line type="monotone" dataKey="revenue" stroke="#087a7d" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer></div></article>;
}

export function Dashboard({ token }: { token: string }) {
  const [stats, setStats] = useState<Stats>();
  const [range, setRange] = useState({ from: '', to: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api<Stats>('/admin/stats/overview' + query(range), { token, signal: controller.signal }).then(setStats)
      .catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [token, range]);
  const changeRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setRange({ from: String(fields.get('from')), to: String(fields.get('to')) });
  };
  return <div className="stack"><h2>Tổng quan doanh thu</h2>
    <p>Doanh thu chỉ tính đơn đã giao, gồm phí đóng gói và vận chuyển, theo ngày đặt tại Việt Nam.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!stats ? <p>{error ? 'Không thể tải thống kê.' : 'Đang tải thống kê…'}</p> : <>
      <div className="metrics"><div className="panel"><small>Hôm nay</small><strong>{money(stats.todayRevenue)}</strong></div>
        <div className="panel"><small>Tháng này</small><strong>{money(stats.monthRevenue)}</strong></div></div>
      <div className="charts"><Chart title="30 ngày gần nhất" rows={stats.daily} /><Chart title="12 tháng gần nhất" rows={stats.monthly} /></div>
      <form className="panel form-grid" onSubmit={changeRange}>
        <label>Từ ngày<input type="date" name="from" /></label><label>Đến ngày<input type="date" name="to" /></label>
        <button className="button">Lọc thống kê đơn</button><small>Mặc định 30 ngày gần nhất.</small>
      </form>
      <div className="panel line"><div><small>Đã giao</small><strong>{stats.total.delivered}</strong></div><div><small>Đang xử lý</small><strong>{stats.total.processing}</strong></div>
        <div><small>Đã hủy</small><strong>{stats.total.cancelled}</strong></div></div>
      <div className="panel stack table-scroll"><h3>Sản phẩm bán chạy</h3><table>
        <thead><tr><th>Sản phẩm</th><th>Đã giao</th><th>Tiền hàng</th></tr></thead>
        <tbody>{stats.top.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.quantity}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table>
        {!stats.top.length && <p>Chưa có sản phẩm đã giao trong khoảng đã chọn.</p>}
      </div>
      <div className="panel stack table-scroll"><h3>Doanh thu theo danh mục</h3><small>Tiền hàng của đơn đã giao, theo danh mục khi đặt.</small>
        <table><thead><tr><th>Danh mục</th><th>Tiền hàng</th></tr></thead><tbody>{stats.categories.map(row =>
          <tr key={row.name}><td>{row.name}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div>
    </>}
  </div>;
}
