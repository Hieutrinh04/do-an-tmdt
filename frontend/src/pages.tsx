import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText, Product } from './api';
import { fitDescription, fitTitle, useSeo } from './seo';
import { ProductCard } from './catalog';
import { Breadcrumb } from './breadcrumb';
import { useApi, useCategories, useSite } from './data';

type Section = { heading: string; paragraphs?: string[]; items?: string[]; table?: { head: string[]; rows: string[][] } };
type PageData = { slug: string; path: string; title: string; description: string; h1: string; intro: string; sections: Section[] };


export function CategoryPage() {
  const { slug = '' } = useParams();
  const categories = useCategories();
  const category = categories.find(item => item.slug === slug);
  const [rows, setRows] = useState<Product[]>([]);
  const [status, setStatus] = useState('Đang tải sản phẩm…');
  const [sort, setSort] = useState('default');
  useSeo(category ? {
    title: fitTitle(category.name + ' — Long Fish', [' | Hàng Mới ' + new Date().getFullYear(), ' | Giá Tốt', '']),
    description: fitDescription('Mua ' + category.name + ' tại Long Fish: ' + category.count + ' sản phẩm. ' + category.description),
  } : undefined);
  useEffect(() => {
    if (!category) return;
    let alive = true;
    api<Product[]>('/products?category=' + encodeURIComponent(category.name))
      .then(result => { if (alive) { setRows(result); setStatus(result.length ? '' : 'Danh mục này chưa có sản phẩm.'); } })
      .catch(reason => { if (alive) setStatus(errorText(reason)); });
    return () => { alive = false; };
  }, [category?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (categories.length && !category) return <section className="shell section"><Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: 'Không tìm thấy danh mục' }]} />
    <h1>Không tìm thấy danh mục</h1><Link to="/">Quay lại cửa hàng →</Link></section>;
  const sorted = [...rows].sort((a, b) => sort === 'asc' ? a.price - b.price : sort === 'desc' ? b.price - a.price : 0);
  return <section className="shell section">
    <Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: category?.name || 'Danh mục' }]} />
    <header className="category-head"><h1>{category?.name || 'Danh mục'}</h1>{category && <p>{category.description}</p>}</header>
    <div className="catalog-filters">
      <label>Sắp xếp theo<select value={sort} onChange={event => setSort(event.target.value)}>
        <option value="default">Mặc định</option><option value="asc">Giá tăng dần</option><option value="desc">Giá giảm dần</option></select></label>
      <p className="muted">{rows.length ? rows.length + ' sản phẩm' : ''}</p>
    </div>
    {status && <p role="status">{status}</p>}
    <div className="grid-products">{sorted.map(product => <ProductCard key={product.id} product={product} />)}</div>
  </section>;
}

function Content({ section }: { section: Section }) {
  return <section className="prose-block"><h2>{section.heading}</h2>
    {section.paragraphs?.map((text, index) => <p key={index}>{text}</p>)}
    {section.items && <ul>{section.items.map((text, index) => <li key={index}>{text}</li>)}</ul>}
    {section.table && <div className="table-wrap"><table><thead><tr>{section.table.head.map(cell => <th key={cell}>{cell}</th>)}</tr></thead>
      <tbody>{section.table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}

export function ContentPage({ slug }: { slug: string }) {
  const page = useApi<PageData | null>('/pages/' + slug, null);
  useSeo(page ? { title: page.title, description: page.description } : undefined);
  if (!page) return <section className="shell section narrow"><p role="status">Đang tải…</p></section>;
  return <section className="shell section narrow">
    <Breadcrumb trail={[{ name: 'Trang chủ', to: '/' }, { name: page.h1 }]} />
    <article className="prose"><h1>{page.h1}</h1><p className="lead">{page.intro}</p>
      {page.sections.map(section => <Content key={section.heading} section={section} />)}
      {slug === 'lien-he' && <ContactBlock />}
    </article>
  </section>;
}

function ContactBlock() {
  const site = useSite();
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setState('sending'); setError('');
    try { await api('/contact', { method: 'POST', body: fields }); setState('done'); form.reset(); }
    catch (reason) { setError(errorText(reason)); setState('idle'); }
  }
  return <div className="contact-grid">
    <section className="prose-block"><h2>Thông tin cửa hàng</h2>
      <ul className="contact-list">
        {site?.address && <li><strong>Địa chỉ:</strong> {site.address}</li>}
        {site?.phone && <li><strong>Điện thoại:</strong> <a href={'tel:' + site.phone.replace(/\s/g, '')}>{site.phone}</a></li>}
        {site?.email && <li><strong>Email:</strong> <a href={'mailto:' + site.email}>{site.email}</a></li>}
        {site?.hours && <li><strong>Giờ làm việc:</strong> {site.hours}</li>}
        {site?.facebook && <li><strong>Fanpage:</strong> <a href={site.facebook} target="_blank" rel="noopener noreferrer">Nhắn tin cho {site.name}</a></li>}
      </ul>
    </section>
    <section className="prose-block"><h2>Gửi tin nhắn cho chúng tôi</h2>
      {state === 'done' ? <p role="status" className="success">Đã gửi. {site?.name || 'Long Fish'} sẽ phản hồi qua email của bạn trong giờ làm việc.</p> :
        <form className="stack" onSubmit={submit}>
          <label>Họ và tên<input name="name" required maxLength={100} autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
          <label>Nội dung<textarea name="message" required minLength={10} maxLength={2000} rows={5} /></label>
          {/* Bẫy chống bot: người thật không thấy và không điền ô này. */}
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button" disabled={state === 'sending'}>{state === 'sending' ? 'Đang gửi…' : 'Gửi tin nhắn'}</button>
        </form>}
    </section>
  </div>;
}
