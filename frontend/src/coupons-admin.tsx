import { FormEvent, useEffect, useState } from 'react';
import { api, errorText, localDate, money } from './api';

type Coupon = { id: string; code: string; kind: 'PERCENT' | 'FIXED' | 'FREESHIP'; value: number; description: string; minSubtotal: number; categories: string[];
  firstOrderOnly: boolean; perCustomerLimit: number; usageLimit: number; usedCount: number; startsAt: string | null; expiresAt: string | null; isActive: boolean };

const kindLabel = { PERCENT: 'Giảm %', FIXED: 'Giảm số tiền', FREESHIP: 'Miễn phí vận chuyển' } as const;
const valueText = (coupon: Coupon) => coupon.kind === 'PERCENT' ? coupon.value + '%' : coupon.kind === 'FIXED' ? money(coupon.value) : 'Miễn phí ship';
const localInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
};

export function CouponsAdmin({ token }: { token: string }) {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<Coupon['kind']>('PERCENT');
  const load = () => api<Coupon[]>('/admin/coupons', { token }).then(setRows).catch(reason => setError(errorText(reason)));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setError(''); setStatus('');
    try {
      await api('/admin/coupons', { token, method: 'POST', body: {
        code: fields.get('code'), kind, value: kind === 'FREESHIP' ? 0 : Number(fields.get('value')), description: fields.get('description') || '',
        minSubtotal: Number(fields.get('minSubtotal') || 0), categories: String(fields.get('categories') || '').split(',').map(value => value.trim()).filter(Boolean),
        firstOrderOnly: fields.has('firstOrderOnly'), perCustomerLimit: Number(fields.get('perCustomerLimit') || 0), usageLimit: Number(fields.get('usageLimit') || 0),
        startsAt: fields.get('startsAt') ? new Date(String(fields.get('startsAt'))).toISOString() : null,
        expiresAt: fields.get('expiresAt') ? new Date(String(fields.get('expiresAt'))).toISOString() : null,
      } });
      form.reset(); setKind('PERCENT'); setStatus('Đã tạo mã giảm giá.'); await load();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function toggle(coupon: Coupon) {
    setError(''); setStatus('');
    try { await api('/admin/coupons/' + coupon.id, { token, method: 'PATCH', body: { isActive: !coupon.isActive } }); await load(); }
    catch (reason) { setError(errorText(reason)); }
  }
  return <div className="stack"><h2>Mã giảm giá</h2>
    {error && <p role="alert" className="error">{error}</p>}{status && <p role="status" className="success">{status}</p>}
    <div className="table-wrap"><table className="orders-table"><thead><tr><th>Mã</th><th>Loại</th><th>Điều kiện</th><th>Đã dùng</th><th>Hiệu lực</th><th>Trạng thái</th></tr></thead>
      <tbody>{rows.map(coupon => <tr key={coupon.id}>
        <td><strong>{coupon.code}</strong><br /><small>{coupon.description}</small></td>
        <td>{kindLabel[coupon.kind]}<br />{valueText(coupon)}</td>
        <td><small>{[coupon.minSubtotal ? 'Đơn từ ' + money(coupon.minSubtotal) : '', coupon.categories.length ? 'Danh mục: ' + coupon.categories.join(', ') : '', coupon.firstOrderOnly ? 'Đơn đầu tiên' : '',
          coupon.perCustomerLimit ? coupon.perCustomerLimit + ' lần/người' : ''].filter(Boolean).join(' · ') || 'Không điều kiện'}</small></td>
        <td>{coupon.usedCount}{coupon.usageLimit ? ' / ' + coupon.usageLimit : ''}</td>
        <td><small>{coupon.startsAt ? 'Từ ' + localDate(coupon.startsAt) : ''}{coupon.startsAt && coupon.expiresAt ? <br /> : ''}{coupon.expiresAt ? 'Đến ' + localDate(coupon.expiresAt) : !coupon.startsAt ? 'Không giới hạn' : ''}</small></td>
        <td><button className="outline" onClick={() => void toggle(coupon)}>{coupon.isActive ? 'Đang bật · Tắt' : 'Đã tắt · Bật'}</button></td></tr>)}</tbody></table></div>
    <form className="form-grid panel" onSubmit={create}><h3 className="full">Tạo mã mới</h3>
      <label>Mã (chữ hoa, không dấu)<input name="code" required minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" /></label>
      <label>Loại<select value={kind} onChange={event => setKind(event.target.value as Coupon['kind'])}>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {kind !== 'FREESHIP' && <label>{kind === 'PERCENT' ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (₫)'}<input name="value" type="number" min={1} max={kind === 'PERCENT' ? 100 : 100000000} required /></label>}
      <label>Đơn tối thiểu (₫)<input name="minSubtotal" type="number" min={0} defaultValue={0} /></label>
      <label className="full">Mô tả hiển thị cho khách<input name="description" maxLength={300} /></label>
      <label>Chỉ áp dụng danh mục (cách nhau bằng dấu phẩy, để trống = tất cả)<input name="categories" placeholder="Thiết bị, Thức ăn" /></label>
      <label>Số lần mỗi khách (0 = không giới hạn)<input name="perCustomerLimit" type="number" min={0} defaultValue={0} /></label>
      <label>Tổng số lượt dùng (0 = không giới hạn)<input name="usageLimit" type="number" min={0} defaultValue={0} /></label>
      <label>Bắt đầu<input name="startsAt" type="datetime-local" defaultValue={localInput(null)} /></label>
      <label>Hết hạn<input name="expiresAt" type="datetime-local" /></label>
      <label className="radio"><input name="firstOrderOnly" type="checkbox" /> Chỉ cho đơn hàng đầu tiên của khách</label>
      <div className="full"><button className="button" disabled={busy}>{busy ? 'Đang lưu…' : 'Tạo mã'}</button></div>
    </form>
  </div>;
}
