import { money } from './api';

// Giá: khi đang khuyến mãi hiện giá gốc gạch ngang và giá sau giảm.
export function PriceTag({ regular, unit }: { regular: number; unit: number }) {
  return unit < regular ? <span className="price-sale"><del aria-label={'Giá gốc ' + money(regular)}>{money(regular)}</del> <strong>{money(unit)}</strong></span> : <span>{money(unit)}</span>;
}
