import { FormEvent, useEffect, useState } from 'react';
import { api, errorText, localDate, money } from './api';
import { Drawer, Empty, Icon } from './admin-tools';

type Coupon = { id: string; code: string; kind: 'PERCENT' | 'FIXED' | 'FREESHIP'; value: number; description: string; minSubtotal: number; categories: string[];
  firstOrderOnly: boolean; perCustomerLimit: number; usageLimit: number; usedCount: number; startsAt: string | null; expiresAt: string | null; isActive: boolean };

const kindLabel = { PERCENT: 'Giảm %', FIXED: 'Giảm số tiền', FREESHIP: 'Miễn phí vận chuyển' } as const;
const valueText = (coupon: Coupon) => coupon.kind === 'PERCENT' ? '−' + coupon.value + '%' : coupon.kind === 'FIXED' ? '−' + (coupon.value >= 1000 ? coupon.value / 1000 + 'K' : money(coupon.value)) : 'Free ship';
const localInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
};
function state(coupon: Coupon, now = Date.now()) {
  if (!coupon.isActive) return { key: 'off', label: 'Đã tắt' };
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) < now) return { key: 'expired', label: 'Hết hạn' };
  if (coupon.startsAt && Date.parse(coupon.startsAt) > now) return { key: 'soon', label: 'Chưa bắt đầu' };
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return { key: 'expired', label: 'Hết lượt' };
  return { key: 'on', label: 'Đang chạy' };
}

function CouponForm({ coupon, busy, onSubmit }: { coupon?: Coupon; busy: boolean; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [kind, setKind] = useState<Coupon['kind']>(coupon?.kind ?? 'PERCENT');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    await onSubmit({
      code: fields.get('code'), kind, value: kind === 'FREESHIP' ? 0 : Number(fields.get('value')), description: fields.get('description') || '',
      minSubtotal: Number(fields.get('minSubtotal') || 0), categories: String(fields.get('categories') || '').split(',').map(value => value.trim()).filter(Boolean),
      firstOrderOnly: fields.has('firstOrderOnly'), perCustomerLimit: Number(fields.get('perCustomerLimit') || 0), usageLimit: Number(fields.get('usageLimit') || 0),
      startsAt: fields.get('startsAt') ? new Date(String(fields.get('startsAt'))).toISOString() : null,
      expiresAt: fields.get('expiresAt') ? new Date(String(fields.get('expiresAt'))).toISOString() : null,
      isActive: fields.has('isActive'),
    });
  }
  return <form className="form-grid" onSubmit={event => void submit(event).catch(() => {})}>
    <label>Mã (chữ và số, không dấu)<input name="code" required minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" defaultValue={coupon?.code} style={{ textTransform: 'uppercase' }} /></label>
    <label>Loại<select value={kind} onChange={event => setKind(event.target.value as Coupon['kind'])}>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {kind !== 'FREESHIP' && <label>{kind === 'PERCENT' ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (₫)'}<input name="value" type="number" min={1} max={kind === 'PERCENT' ? 100 : 100000000} required defaultValue={coupon && coupon.kind === kind ? coupon.value : undefined} /></label>}
    <label>Đơn tối thiểu (₫)<input name="minSubtotal" type="number" min={0} defaultValue={coupon?.minSubtotal ?? 0} /></label>
    <label className="full">Mô tả hiển thị cho khách<input name="description" maxLength={300} defaultValue={coupon?.description} placeholder="Ví dụ: Giảm 10% cho đơn đầu tiên" /></label>
    <label className="full">Chỉ áp dụng danh mục (cách nhau bằng dấu phẩy, để trống = tất cả)<input name="categories" placeholder="Thiết bị, Thức ăn" defaultValue={coupon?.categories.join(', ')} /></label>
    <label>Số lần mỗi khách (0 = không giới hạn)<input name="perCustomerLimit" type="number" min={0} defaultValue={coupon?.perCustomerLimit ?? 0} /></label>
    <label>Tổng số lượt (0 = không giới hạn)<input name="usageLimit" type="number" min={0} defaultValue={coupon?.usageLimit ?? 0} /></label>
    <label>Bắt đầu<input name="startsAt" type="datetime-local" defaultValue={localInput(coupon?.startsAt)} /></label>
    <label>Hết hạn<input name="expiresAt" type="datetime-local" defaultValue={localInput(coupon?.expiresAt)} /></label>
    <label className="ad-check"><input name="firstOrderOnly" type="checkbox" defaultChecked={coupon?.firstOrderOnly} /> Chỉ cho đơn hàng đầu tiên</label>
    <label className="ad-check"><input name="isActive" type="checkbox" defaultChecked={coupon?.isActive ?? true} /> Bật mã</label>
    <div className="full ad-row ad-sticky"><button className="ad-btn ad-btn--primary" disabled={busy}>{busy ? 'Đang lưu…' : coupon ? 'Lưu mã' : 'Tạo mã'}</button></div>
  </form>;
}

export function CouponsAdmin({ token }: { token: string }) {
  const [rows, setRows] = useState<Coupon[]>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Coupon | 'new'>();
  const load = () => api<Coupon[]>('/admin/coupons', { token }).then(setRows).catch(reason => setError(errorText(reason)));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!status) return; const timer = window.setTimeout(() => setStatus(''), 3500); return () => window.clearTimeout(timer); }, [status]);

  async function save(body: Record<string, unknown>) {
    setBusy(true); setError(''); setStatus('');
    try {
      const target = editing === 'new' || !editing ? undefined : editing;
      await api('/admin/coupons' + (target ? '/' + target.id : ''), { token, method: target ? 'PATCH' : 'POST', body });
      setStatus(target ? 'Đã lưu mã ' + String(body.code).toUpperCase() + '.' : 'Đã tạo mã ' + String(body.code).toUpperCase() + '.');
      setEditing(undefined); await load();
    } catch (reason) { setError(errorText(reason)); throw reason; } finally { setBusy(false); }
  }
  async function toggle(coupon: Coupon) {
    setError(''); setStatus('');
    try { await api('/admin/coupons/' + coupon.id, { token, method: 'PATCH', body: { isActive: !coupon.isActive } }); await load(); setStatus((coupon.isActive ? 'Đã tắt ' : 'Đã bật ') + coupon.code + '.'); }
    catch (reason) { setError(errorText(reason)); }
  }
  const running = rows?.filter(row => state(row).key === 'on').length ?? 0;
  const used = rows?.reduce((sum, row) => sum + row.usedCount, 0) ?? 0;
  return <div className="ad-page">
    <div className="ad-head">
      <div><h1>Mã giảm giá</h1><p className="ad-muted">{rows ? rows.length + ' mã · ' + running + ' đang chạy · ' + used + ' lượt đã dùng' : 'Đang tải…'}</p></div>
      <button className="ad-btn ad-btn--primary" onClick={() => setEditing('new')}><Icon name="plus" />Tạo mã</button>
    </div>
    {error && !editing && <p role="alert" className="ad-error">{error}</p>}
    {status && <p role="status" className="ad-toast">{status}</p>}
    {!rows ? <p className="ad-muted">Đang tải…</p> : !rows.length ? <Empty title="Chưa có mã giảm giá">Tạo mã đầu tiên, ví dụ giảm 10% cho khách mới.</Empty> :
      <div className="ad-tickets">{rows.map(coupon => {
        const current = state(coupon);
        const conditions = [coupon.minSubtotal ? 'Đơn từ ' + money(coupon.minSubtotal) : '', coupon.categories.length ? 'Danh mục ' + coupon.categories.join(', ') : '',
          coupon.firstOrderOnly ? 'Đơn đầu tiên' : '', coupon.perCustomerLimit ? coupon.perCustomerLimit + ' lần/khách' : ''].filter(Boolean);
        return <article key={coupon.id} className={'ad-ticket is-' + current.key}>
          <div className="ad-ticket__stub"><strong>{valueText(coupon)}</strong><small>{coupon.kind === 'FIXED' ? 'Giảm ' + money(coupon.value) : kindLabel[coupon.kind]}</small></div>
          <div className="ad-ticket__body">
            <header><code>{coupon.code}</code><span className={'ad-state is-' + current.key}>{current.label}</span></header>
            {coupon.description && <p>{coupon.description}</p>}
            <p className="ad-muted">{conditions.join(' · ') || 'Không điều kiện'}</p>
            <p className="ad-muted">{coupon.startsAt ? 'Từ ' + localDate(coupon.startsAt) : ''}{coupon.startsAt && coupon.expiresAt ? ' · ' : ''}{coupon.expiresAt ? 'Đến ' + localDate(coupon.expiresAt) : !coupon.startsAt ? 'Không thời hạn' : ''}</p>
            <div className="ad-usage" aria-label={'Đã dùng ' + coupon.usedCount + (coupon.usageLimit ? ' trên ' + coupon.usageLimit : '') + ' lượt'}>
              <span className="ad-bars__track"><span style={{ width: coupon.usageLimit ? Math.min(100, coupon.usedCount / coupon.usageLimit * 100) + '%' : coupon.usedCount ? '100%' : '0%' }} className={coupon.usageLimit ? '' : 'is-free'} /></span>
              <small>{coupon.usedCount}{coupon.usageLimit ? ' / ' + coupon.usageLimit : ''} lượt</small>
            </div>
            <footer className="ad-row">
              <label className="ad-switch"><input type="checkbox" checked={coupon.isActive} onChange={() => void toggle(coupon)} /><span>{coupon.isActive ? 'Đang bật' : 'Đang tắt'}</span></label>
              <button className="ad-btn ad-btn--ghost ad-btn--sm" onClick={() => setEditing(coupon)}>Sửa</button>
            </footer>
          </div>
        </article>;
      })}</div>}
    {editing && <Drawer title={editing === 'new' ? 'Tạo mã giảm giá' : 'Sửa mã ' + editing.code}
      subtitle={editing === 'new' ? 'Máy chủ luôn kiểm tra lại điều kiện khi khách đặt hàng.' : 'Đã dùng ' + editing.usedCount + ' lượt.'} onClose={() => { setEditing(undefined); setError(''); }}>
      {error && <p role="alert" className="ad-error">{error}</p>}
      <CouponForm key={editing === 'new' ? 'new' : editing.id} coupon={editing === 'new' ? undefined : editing} busy={busy} onSubmit={save} />
    </Drawer>}
  </div>;
}
