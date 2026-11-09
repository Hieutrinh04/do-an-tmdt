import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Catalog, ProductPage } from './catalog';
import { Checkout, Confirm, Track } from './checkout';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/patrick-hand/400.css';
import './style.css';
import { CreditsPage } from './photos';

const Admin = lazy(() => import('./admin').then(module => ({ default: module.Admin }))); 

function StoreLayout() {
  const { search, pathname } = useLocation();
  const psid = new URLSearchParams(search).get('psid');
  if (psid && /^\d{1,40}$/.test(psid)) { sessionStorage.setItem('longFish.psid', psid); sessionStorage.setItem('longFish.context', new URLSearchParams(search).get('context') || ''); }
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return <>
    <div className="notice">Cá sống được đóng gói riêng khi giao · Xem cam kết cá sống ở trang từng sản phẩm</div>
    <header className="header"><div className="shell nav">
      <Link className="brand" to="/"><img src="/fish.svg" alt="" />Long Fish</Link>
      <nav aria-label="Điều hướng chính"><Link to="/">Cửa hàng</Link><Link to="/track">Tra cứu</Link><Link to="/checkout">Giỏ hàng ↗</Link></nav>
    </div></header>
    <main><Routes>
      <Route path="/" element={<Catalog />} /><Route path="/credits" element={<CreditsPage />} /><Route path="/product/:slug" element={<ProductPage />} />
      <Route path="/checkout" element={<Checkout />} /><Route path="/confirmation" element={<Confirm />} /><Route path="/track" element={<Track />} />
      <Route path="/admin/*" element={<Suspense fallback={<p className="shell section">Đang tải quản trị…</p>}><Admin /></Suspense>} /><Route path="*" element={<section className="shell section"><h1>Không tìm thấy trang</h1><Link to="/">Về cửa hàng</Link></section>} />
    </Routes></main>
    <footer className="shell footer"><Link className="brand" to="/"><img src="/fish.svg" alt="" />Long Fish</Link><span>Cá cảnh, thiết bị và cây thủy sinh.</span><Link to="/credits">Nguồn ảnh</Link><Link to="/admin">Quản trị cửa hàng</Link></footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><StoreLayout /></BrowserRouter>);


