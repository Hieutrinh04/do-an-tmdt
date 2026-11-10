import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { money } from './api';
import { useCart, useCartLines } from './cart-data';
import { ProductImage } from './photos';

function Panel() {
  const { cart, update } = useCart();
  const { lines, subtotal } = useCartLines(cart);
  if (!cart.length) return <p className="muted">Giỏ hàng đang trống.</p>;
  return <>
    <ul className="mini-list">{lines.map(line => <li key={line.variantId}>
      {line.product && <ProductImage className="thumb" slug={line.slug} source={line.product.images[0]} thumbnail alt={line.product.name} />}
      <div><strong>{line.product?.name || 'Sản phẩm'}</strong><small>{line.variant ? line.variant.color + ' / ' + line.variant.size : ''}</small>
        <small>{line.quantity} × {money(line.unit)}</small></div>
      <button type="button" className="text-button" aria-label={'Xóa ' + (line.product?.name || 'sản phẩm')} onClick={() => update(line.variantId, 0)}>✕</button>
    </li>)}</ul>
    <p className="mini-total"><span>Tạm tính</span><strong>{money(subtotal)}</strong></p>
    <div className="mini-actions"><Link className="outline button-link" to="/gio-hang">Xem giỏ hàng</Link><Link className="button" to="/checkout">Thanh toán</Link></div>
  </>;
}

// Giỏ hàng thu nhỏ trên header: số lượng ở huy hiệu; rê chuột hoặc bấm để xem sản phẩm, tổng tiền, nút "Xem giỏ hàng" và "Thanh toán".
export function MiniCart({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="mini-cart" ref={box} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <Link className="cart-link" to="/gio-hang" aria-label={'Giỏ hàng, ' + count + ' sản phẩm'} aria-haspopup="true" aria-expanded={open}
      onClick={event => { if (window.matchMedia('(hover: none)').matches && !open) { event.preventDefault(); setOpen(true); } }}>
      <span aria-hidden="true">🛒</span>{count > 0 && <span className="cart-badge">{count}</span>}</Link>
    {open && <div className="mini-panel" role="dialog" aria-label="Giỏ hàng thu nhỏ"><Panel /></div>}
  </div>;
}
