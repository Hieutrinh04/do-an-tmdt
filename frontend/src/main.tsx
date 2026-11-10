import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FormEvent, lazy, Suspense, useEffect, useState } from 'react';
import { Catalog, ProductPage } from './catalog';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/patrick-hand/400.css';
import './style.css';
import { CreditsPage } from './photos';
import { applySeo, seoForPath } from './seo';
import { useCategories, useSite } from './data';
import { cartChanged, cartCount } from './cart';

// Tách mã theo trang: trang chủ và sản phẩm tải nhanh hơn vì không phải tải cả giỏ hàng, tra cứu, danh mục và trang nội dung.
const Checkout = lazy(() => import('./checkout').then(module => ({ default: module.Checkout })));
const Confirm = lazy(() => import('./checkout').then(module => ({ default: module.Confirm })));
const Track = lazy(() => import('./checkout').then(module => ({ default: module.Track })));
const CategoryPage = lazy(() => import('./pages').then(module => ({ default: module.CategoryPage })));
const ContentPage = lazy(() => import('./pages').then(module => ({ default: module.ContentPage })));
const Admin = lazy(() => import('./admin').then(module => ({ default: module.Admin }))); 

function LegacyProduct() { const { slug } = useParams(); return <Navigate replace to={'/san-pham/' + slug} />; }

function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(cartCount);
  const [term, setTerm] = useState('');
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const update = () => setCount(cartCount());
    window.addEventListener(cartChanged, update); window.addEventListener('storage', update);
    return () => { window.removeEventListener(cartChanged, update); window.removeEventListener('storage', update); };
  }, []);
  const search = (event: FormEvent) => { event.preventDefault(); navigate(term.trim() ? '/?q=' + encodeURIComponent(term.trim()) + '#san-pham' : '/'); setOpen(false); };
  return <header className="header"><div className="shell nav">
    <Link className="brand" to="/"><img src="/fish.svg" alt="Logo Long Fish" width={32} height={32} />Long Fish</Link>
    <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen(value => !value)}><span className="sr-only">{open ? 'Đóng menu' : 'Mở menu'}</span><span aria-hidden="true">{open ? '✕' : '☰'}</span></button>
    <div id="main-menu" className={'menu' + (open ? ' open' : '')}>
      <nav aria-label="Điều hướng chính">
        <NavLink to="/" end>Trang chủ</NavLink>
        <div className="dropdown"><NavLink to="/#san-pham" className={pathname.startsWith('/danh-muc') ? 'active' : ''}>Cửa hàng ▾</NavLink>
          <ul className="dropdown-menu">{categories.slice(0, 6).map(item => <li key={item.slug}><Link to={'/danh-muc/' + item.slug}>{item.name}</Link></li>)}
            <li><Link to="/#san-pham"><strong>Tất cả sản phẩm</strong></Link></li></ul></div>
        <NavLink to="/gioi-thieu">Giới thiệu</NavLink>
        <NavLink to="/track">Tra cứu đơn</NavLink>
        <NavLink to="/lien-he">Liên hệ</NavLink>
      </nav>
      <form className="header-search" role="search" onSubmit={search}><label className="sr-only" htmlFor="header-q">Tìm sản phẩm</label>
        <input id="header-q" type="search" value={term} onChange={event => setTerm(event.target.value)} placeholder="Tìm sản phẩm..." />
        <button type="submit" aria-label="Tìm kiếm">🔍</button></form>
    </div>
    <Link className="cart-link" to="/checkout" aria-label={'Giỏ hàng, ' + count + ' sản phẩm'}><span aria-hidden="true">🛒</span>{count > 0 && <span className="cart-badge">{count}</span>}</Link>
  </div></header>;
}

function Footer() {
  const site = useSite();
  const categories = useCategories();
  const name = site?.name || 'Long Fish';
  return <footer className="site-footer"><div className="shell footer-grid">
    <section><Link className="brand" to="/"><img src="/fish.svg" alt="Logo Long Fish" width={28} height={28} />{name}</Link>
      <p>{name} bán cá cảnh nước ngọt, cây thủy sinh, thức ăn và thiết bị. Thông số nuôi rõ ràng, cá sống đóng gói riêng, đặt hàng trực tuyến dễ dàng.</p>
      <p className="social">{site?.facebook && <a href={site.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
        {site?.tiktok && <a href={site.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a>}
        {site?.instagram && <a href={site.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}</p></section>
    <nav aria-label="Liên kết nhanh"><h2>Liên kết nhanh</h2><ul>
      <li><Link to="/">Trang chủ</Link></li><li><Link to="/#san-pham">Cửa hàng</Link></li><li><Link to="/gioi-thieu">Giới thiệu</Link></li><li><Link to="/lien-he">Liên hệ</Link></li>
      <li><Link to="/chinh-sach-doi-tra">Chính sách đổi trả</Link></li><li><Link to="/chinh-sach-bao-mat">Chính sách bảo mật</Link></li><li><Link to="/chinh-sach-van-chuyen">Chính sách vận chuyển</Link></li></ul></nav>
    <nav aria-label="Danh mục sản phẩm"><h2>Danh mục</h2><ul>{categories.slice(0, 6).map(item => <li key={item.slug}><Link to={'/danh-muc/' + item.slug}>{item.name}</Link></li>)}</ul></nav>
    <section><h2>Liên hệ & hỗ trợ</h2><ul className="contact-list">
      {site?.address && <li>{site.address}</li>}{site?.phone && <li><a href={'tel:' + site.phone.replace(/\s/g, '')}>{site.phone}</a></li>}
      {site?.email && <li><a href={'mailto:' + site.email}>{site.email}</a></li>}{site?.hours && <li>Giờ làm việc: {site.hours}</li>}
      <li><Link to="/lien-he">Gửi tin nhắn cho chúng tôi →</Link></li></ul></section>
  </div>
  <div className="shell footer-bottom"><span>© {new Date().getFullYear()} {name}. Cá cảnh, thiết bị và cây thủy sinh.</span>
    <span>Thanh toán: COD · Chuyển khoản VietQR</span>
    <span><Link to="/credits">Nguồn ảnh</Link> · <Link to="/admin">Quản trị cửa hàng</Link></span></div></footer>;
}

function StoreLayout() {
  const { search, pathname } = useLocation();
  const psid = new URLSearchParams(search).get('psid');
  if (psid && /^\d{1,40}$/.test(psid)) { sessionStorage.setItem('longFish.psid', psid); sessionStorage.setItem('longFish.context', new URLSearchParams(search).get('context') || ''); }
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  // Trang chủ, sản phẩm, danh mục và trang nội dung có thẻ SEO riêng (máy chủ chèn sẵn, giao diện tự cập nhật); chỉ xử lý các trang còn lại.
  useEffect(() => { const seo = seoForPath(pathname); if (seo) applySeo(seo); }, [pathname]);
  return <>
    <div className="notice">Cá sống được đóng gói riêng khi giao · Xem cam kết cá sống ở trang từng sản phẩm</div>
    <Header />
    <main><Suspense fallback={<p className="shell section" role="status">Đang tải…</p>}><Routes>
      <Route path="/" element={<Catalog />} /><Route path="/credits" element={<CreditsPage />} />
      <Route path="/san-pham/:slug" element={<ProductPage />} /><Route path="/product/:slug" element={<LegacyProduct />} /><Route path="/danh-muc/:slug" element={<CategoryPage />} />
      <Route path="/gioi-thieu" element={<ContentPage slug="gioi-thieu" />} /><Route path="/lien-he" element={<ContentPage slug="lien-he" />} />
      <Route path="/chinh-sach-doi-tra" element={<ContentPage slug="chinh-sach-doi-tra" />} /><Route path="/chinh-sach-bao-mat" element={<ContentPage slug="chinh-sach-bao-mat" />} />
      <Route path="/chinh-sach-van-chuyen" element={<ContentPage slug="chinh-sach-van-chuyen" />} />
      <Route path="/checkout" element={<Checkout />} /><Route path="/confirmation" element={<Confirm />} /><Route path="/track" element={<Track />} />
      <Route path="/admin/*" element={<Suspense fallback={<p className="shell section">Đang tải quản trị…</p>}><Admin /></Suspense>} /><Route path="*" element={<section className="shell section"><h1>Không tìm thấy trang</h1><Link to="/">Về cửa hàng</Link></section>} />
    </Routes></Suspense></main>
    <Footer />
  </>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><StoreLayout /></BrowserRouter>);


