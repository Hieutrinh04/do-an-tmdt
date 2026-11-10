import { Link } from 'react-router-dom';

// Breadcrumb hiển thị ngay dưới header, trên tiêu đề trang: Trang chủ › Danh mục › Tên sản phẩm (mục cuối đậm hơn).
export function Breadcrumb({ trail }: { trail: { name: string; to?: string }[] }) {
  return <nav className="breadcrumb" aria-label="Đường dẫn điều hướng"><ol>
    {trail.map((item, index) => <li key={item.name + index} aria-current={index === trail.length - 1 ? 'page' : undefined}>
      {item.to && index < trail.length - 1 ? <Link to={item.to}>{item.name}</Link> : <span>{item.name}</span>}
    </li>)}
  </ol></nav>;
}
