import { normalize } from './domain';
import { env, zone } from './env';

export function customerPhrase(raw: string) {
  return normalize(raw).replace(/\b(ko|khong|k|hok|hong)\b/g, 'khong').replace(/\b(bn|bnhieu|nhieu tien)\b/g, 'bao nhieu')
    .replace(/\b(helo|hallo|chaoo|chao shoppp)\b/g, 'chao').replace(/\b(nv|ad|admin)\b/g, 'nhan vien')
    .replace(/\b(ship|shipping|giao hg)\b/g, 'van chuyen').replace(/\b(bettta|beta)\b/g, 'betta')
    .replace(/\b(newbie|moi choi)\b/g, 'nguoi moi').replace(/\b(inbox|ib)\b/g, 'tu van');
}
export function intentFor(phrase: string, attachment = false) {
  if (attachment) return 'attachment';
  if (/bo qua.*(huong dan|quy tac)|giam.*\b90|\bscript\b|drop\s+table|system prompt|ignore.*instructions|mien phi tat ca|doi chinh sach/.test(phrase)) return 'unsafe';
  if (/\b(quay lai bot|bat lai bot|thoat nhan vien)\b/.test(phrase)) return 'resume';
  if (/\b(gap nhan vien|tu van vien|nguoi that|ho tro|noi chuyen voi nhan vien)\b/.test(phrase)) return 'human';
  if (/\b(khuyen mai|voucher|sale|discount|ma giam gia|giam gia|giam khong|chiet khau|uu dai|bot gia|bot chut|bot khong)\b/.test(phrase)) return 'promotion';
  if (/\b(tra cuu|kiem tra don|ma don|don hang|dh\d{8})/.test(phrase)) return 'track';
  if (/\b(van chuyen|giao hang|giao ca|ship|doa|chet|den bu|bao hanh|nhan hang|bao lau|may ngay)\b/.test(phrase)) return 'shipping';
  if (/^(xin chao|chao|hello|hi|alo|hey)(\s+(shop|ban|em|nhan vien|long fish))?[!?.\s🐟👋]*$/.test(phrase) || phrase === 'danh muc') return 'greeting';
  if (/\b(nhiet do|ph|an gi|cham soc|thuc an cho|be toi thieu)\b/.test(phrase)) return 'care';
  if (/\b(con hang|het hang|ton kho|con khong|con ko)\b/.test(phrase)) return 'stock';
  if (/\b(hinh|anh|xem ca)\b/.test(phrase)) return 'photo';
  if (/\b(gia|bao nhieu|bao nhieu tien)\b/.test(phrase) && !/\b(duoi|ngan sach|tam|khoang)\b/.test(phrase)) return 'price';
  if (/\b(ca|betta|guppy|bay mau|neon|cardinal|koi|molly|platy|pleco|be|loc|thuc an|cay|goi y|duoi|de nuoi|an reu|an tao|phu kien|nuoi chung|nguoi moi|ngan sach)\b/.test(phrase)) return 'recommend';
  return 'unknown';
}
export function businessHours(now = new Date()) {
  const open = Number(env.SHOP_OPEN_HOUR ?? 8), close = Number(env.SHOP_CLOSE_HOUR ?? 21);
  const days = (env.SHOP_OPEN_DAYS || '1,2,3,4,5,6,7').split(',').map(Number);
  if (!Number.isInteger(open) || !Number.isInteger(close) || open < 0 || close > 24 || open >= close || !days.length || days.some(n => n < 1 || n > 7)) throw new Error('Giờ làm việc không hợp lệ.');
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(local.find(row => row.type === 'weekday')!.value) + 1;
  const hour = Number(local.find(row => row.type === 'hour')!.value);
  return { open: days.includes(weekday) && hour >= open && hour < close, label: `${open}:00–${close}:00 (giờ Việt Nam), ngày ${days.join(', ')}; 1=Thứ Hai, 7=Chủ nhật` };
}
