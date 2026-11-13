import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, errorText, labels, localDate, money, Order, Status } from './api';

export type LowStock = { id: string; sku: string; color: string; size: string; unit: string; stock: number; lowStockThreshold: number; product: { id: string; name: string; slug: string } };
export type Summary = { pending: number; latestId: string; openHandoffs: number; newContacts: number; lowStockCount: number; lowStock: LowStock[]; statusCounts: Partial<Record<Status, number>> };

/** Số liệu thanh bên: làm mới mỗi 20 giây, phát âm báo (nếu bật) khi có đơn mới. */
export function useSummary(token: string) {
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const latest = useRef<string | undefined>(undefined);
  const audio = useRef<AudioContext | undefined>(undefined);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const value = await api<Summary>('/admin/orders/summary', { token, signal });
      if (soundRef.current && latest.current && latest.current !== value.latestId && audio.current) {
        const ctx = audio.current, oscillator = ctx.createOscillator(), gain = ctx.createGain();
        gain.gain.value = 0.08; oscillator.frequency.value = 660; oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(); oscillator.stop(ctx.currentTime + 0.15);
      }
      latest.current = value.latestId; setSummary(value); setError('');
    } catch (reason) { if (!signal?.aborted) setError(errorText(reason)); }
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(controller.signal), 20000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  async function toggleSound(enabled: boolean) {
    try {
      if (enabled) { audio.current ??= new AudioContext(); await audio.current.resume(); }
      setSound(enabled);
    } catch { setError('Trình duyệt chưa cho phép âm báo.'); }
  }
  return { summary, error, sound, toggleSound, refresh };
}

const icons: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  orders: 'M6 3h12l1 4H5zM5 7h14v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM9 11h6M9 15h4',
  fish: 'M3 12c3-5 9-6 13-3l4-3v12l-4-3c-4 3-10 2-13-3zM14 11.5h.01',
  ticket: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM10 6v12',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6',
  chat: 'M4 5h16v11H9l-5 4z',
  store: 'M4 9l2-5h12l2 5M4 9v11h16V9M4 9h16M10 20v-6h4v6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z',
  alert: 'M12 3l10 18H2zM12 10v4M12 17h.01',
};
export function Icon({ name, size = 18 }: { name: keyof typeof icons | string; size?: number }) {
  return <svg className="ad-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg>;
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={'ad-pill ad-pill--' + status.toLowerCase()}>{labels[status]}</span>;
}
export function PayPill({ order }: { order: Pick<Order, 'paymentMethod' | 'paymentStatus'> }) {
  return <span className={'ad-pay' + (order.paymentStatus === 'PAID' ? ' is-paid' : '')}>{order.paymentMethod === 'COD' ? 'COD' : 'VietQR'} · {order.paymentStatus === 'PAID' ? 'Đã trả' : 'Chưa trả'}</span>;
}

const flow: Status[] = ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED'];
/** "Bể chia ngăn": mỗi ngăn là một bước xử lý đơn, mực nước theo tỉ lệ số đơn đang nằm ở ngăn đó. */
export function OrderTank({ counts, active }: { counts?: Partial<Record<Status, number>>; active?: string }) {
  const values = flow.map(status => counts?.[status] ?? 0);
  const peak = Math.max(1, ...values);
  return <nav className="ad-tank" aria-label="Đơn hàng theo bước xử lý">
    {flow.map((status, index) => {
      const value = values[index];
      const level = counts ? Math.max(value ? 14 : 4, Math.round(value / peak * 82)) : 4;
      return <Link key={status} to={'/admin/orders?status=' + status} className={'ad-tank__cell' + (active === status ? ' is-active' : '') + (status === 'PENDING' && value ? ' is-hot' : '')}
        aria-current={active === status ? 'page' : undefined}>
        <span className="ad-tank__water" style={{ height: level + '%' }} aria-hidden="true" />
        <span className="ad-tank__step">{index + 1 < flow.length ? 'Bước ' + (index + 1) : 'Xong'}</span>
        <strong className="ad-tank__count">{counts ? value : '–'}</strong>
        <span className="ad-tank__label">{labels[status]}</span>
      </Link>;
    })}
    <Link to="/admin/orders?status=CANCELLED" className={'ad-tank__drain' + (active === 'CANCELLED' ? ' is-active' : '')}>
      Đã hủy <strong>{counts ? counts.CANCELLED ?? 0 : '–'}</strong>
    </Link>
  </nav>;
}

/** Ngăn kéo bên phải: Esc để đóng, focus vào tiêu đề khi mở. */
export function Drawer({ title, subtitle, onClose, children, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); };
    window.addEventListener('keydown', key);
    document.body.classList.add('ad-lock');
    return () => { window.removeEventListener('keydown', key); document.body.classList.remove('ad-lock'); previous?.focus?.(); };
  }, []);
  return createPortal(<div className="ad ad-drawer-layer">
    <div className="ad-scrim" onClick={onClose} aria-hidden="true" />
    <aside className={'ad-drawer' + (wide ? ' is-wide' : '')} role="dialog" aria-modal="true" aria-labelledby="ad-drawer-title">
      <header className="ad-drawer__head">
        <div><h2 id="ad-drawer-title" ref={heading} tabIndex={-1}>{title}</h2>{subtitle && <div className="ad-drawer__sub">{subtitle}</div>}</div>
        <button type="button" className="ad-iconbtn" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
      </header>
      <div className="ad-drawer__body">{children}</div>
    </aside>
  </div>, document.body);
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ad-empty"><Icon name="fish" size={28} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function PackingLabel({ order }: { order: Order }) {
  const [qr, setQr] = useState('');
  const url = new URL('/track?code=' + encodeURIComponent(order.code), window.location.origin).toString();
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 180, margin: 1, errorCorrectionLevel: 'M' }).then(value => { if (active) setQr(value); }).catch(() => setQr(''));
    return () => { active = false; };
  }, [url]);
  return <><button type="button" className="ad-btn ad-btn--ghost" onClick={() => window.print()}><Icon name="print" />In phiếu A6</button>{createPortal(<article className="packing-label" aria-label="Phiếu đóng gói A6">
    <h1>LONG FISH · {order.code}</h1><p><strong>{order.customerName}</strong><br />{order.phone}<br />{order.address}</p>
    <p>Giờ nhận mong muốn: {order.preferredDelivery ? localDate(order.preferredDelivery) : 'Chưa hẹn giờ'}</p>
    <table><thead><tr><th>Sản phẩm / phân loại</th><th>SL</th></tr></thead><tbody>{order.items.map(item => <tr key={item.id}><td>{item.productName}<br />{item.color} / {item.size} / {item.gender}</td><td>{item.quantity} {item.unit}</td></tr>)}</tbody></table>
    <p>Tiền hàng: {money(order.subtotal)}<br />Giao hàng: {money(order.shippingFee)} · Đóng gói: {money(order.packingFee)}<br /><strong>Tổng: {money(order.total)}</strong><br />{order.paymentMethod === 'COD' ? 'COD' : 'Chuyển khoản VietQR'} · {order.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</p>
    {order.hasLiveFish && <strong className="live-warning">HÀNG SỐNG – NHẸ TAY / KHÔNG ĐỂ NẮNG</strong>}
    {qr ? <a href={url}><img src={qr} width={100} height={100} alt="QR tra cứu đơn" /></a> : <p>Tra cứu tại {url}</p>}
    <small>Quét mã, nhập số điện thoại đặt hàng để xem trạng thái.</small>
  </article>, document.body)}</>;
}

/** Ngày dạng yyyy-mm-dd theo giờ Việt Nam, dùng cho ô lọc. */
export const vnDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
export const shortDate = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const compact = (value: number) => new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
