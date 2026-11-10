import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { env } from './env';
import { thumbnailPath } from './image-path';
import { careInfo, detail, products, stock } from './catalog';
import { HttpError, normalize, phone, statusLabels, doaPolicy, liveProvinces, liveEverywhere } from './domain';
import { messengerLink, sendMessenger, sendTyping } from './messenger';
import { businessHours, customerPhrase, intentFor } from './bot-language';
import { trackOrder } from './orders';

const choices = ['Danh mục', 'Còn hàng?', 'Gặp nhân viên'];
const text = (value: string, replies: string[] = choices) => ({
  text: value, quick_replies: replies.slice(0, 13).map(label => ({
    content_type: 'text', title: label.slice(0, 20), payload: label.slice(0, 100),
  })),
});
const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
type Product = Awaited<ReturnType<typeof detail>>;
type Selection = { slug?: string; color?: string; size?: string; gender?: string; code?: string; candidates?: string[] };
const inputSchema = z.object({
  mid: z.string().min(1).max(200), psid: z.string().regex(/^\d{1,40}$/),
  text: z.string().trim().max(2000).default(''),
  attachmentType: z.enum(['image', 'sticker', 'location', 'other']).optional(),
  aiQuery: z.string().trim().max(100).optional(),
});

function carousel(items: Product[], psid: string) {
  return {
    attachment: { type: 'template', payload: { template_type: 'generic', elements: items.slice(0, 6).map(product => {
      const url = messengerLink('/san-pham/' + product.slug, psid);
      const image = Array.isArray(product.images) && typeof product.images[0] === 'string' ? product.images[0] : undefined;
      return {
        title: product.name.slice(0, 80),
        subtitle: (money(product.currentPrice) + (product.onSale ? ' (giảm ' + product.salePercent + '%)' : '') + ' · ' + (product.variants.some(row => row.stock >= row.minQty) ? 'Còn hàng' : 'Hết hàng')).slice(0, 80),
        image_url: image ? new URL(thumbnailPath(image), env.PUBLIC_BASE_URL?.trim() || url).toString() : undefined,
        buttons: [{ type: 'web_url', title: 'Xem & đặt hàng', url }],
      };
    }) } },
  };
}

// Khách gõ có dấu thì phải khớp dấu: "lóc" (cá lóc) không được khớp "lọc" (lọc thác).
// Chỉ từ chối khi MỌI lần xuất hiện của từ đó trong tin nhắn đều có dấu và tên sản phẩm không chứa đúng dạng đó.
const foldD = (value: string) => value.replace(/đ/g, 'd');
function accentMismatch(raw: string, stripped: string | undefined, productText: string) {
  if (!stripped || stripped.includes(' ')) return false;
  const name = foldD(productText.toLowerCase().normalize('NFC'));
  const tokens = raw.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(foldD)
    .filter(token => normalize(token) === stripped);
  return tokens.length > 0 && tokens.every(token => token !== stripped && !name.includes(token));
}

function candidatesFrom(items: Product[], phrase: string, raw = '') {
  const budget = phrase.match(/(?:duoi|toi da|tam|khoang|gia|ngan sach)\s*(\d+)\s*(k|nghin|ngan|trieu)?/);
  const limit = budget ? Number(budget[1]) * (budget[2] === 'trieu' ? 1_000_000 : budget[2] ? 1000 : 1) : Infinity;
  const beginner = /\b(de nuoi|nguoi moi)\b/.test(phrase);
  const community = /\b(nuoi chung|be cong dong)\b/.test(phrase);
  const algae = /\b(an reu|don reu|an tao)\b/.test(phrase);
  const length = phrase.match(/\bbe\s*(\d+)\s*cm\b/);
  const compact = /\b(de ban|ban lam viec)\b/.test(phrase) || (!!length && Number(length[1]) <= 40);
  const smallTank = /\bbe nho\b/.test(phrase);
  const species = /\b(betta|guppy|bay mau|neon|cardinal|koi|ca vang|molly|platy|than tien|dia|la han|rong|ca chuot|pleco)\b/.exec(phrase)?.[1];
  const supplies = /\b(loc|thuc an|hat|artemia|den|suoi|sui|cay thuy sinh|vi sinh|be kinh)\b/.exec(phrase)?.[1];
  // "cá lóc" là loài cửa hàng không bán; không để từ "loc" khớp nhầm với lọc thác.
  if (/\bca\s+loc\b/.test(phrase)) return [];
  return items.filter(item => {
    const care = careInfo.safeParse(item.careInfo).data;
    const names = normalize(item.name + ' ' + item.category + ' ' + item.slug);
    const term = species === 'bay mau' ? 'guppy' : species;
    if (term && !names.includes(term)) return false;
    if (!term && supplies && !names.includes(supplies)) return false;
    if (accentMismatch(raw, term, item.name + ' ' + item.category)) return false;
    if (!term && accentMismatch(raw, supplies, item.name + ' ' + item.category)) return false;
    if ((beginner || community || algae || compact || smallTank) && !item.isLiveFish) return false;
    if (beginner && care?.difficulty !== 'Dễ') return false;
    if (community && !care?.community) return false;
    if (algae && !care?.algaeEater) return false;
    if (compact && !care?.compact) return false;
    if (smallTank && (!care || care.minTankLiters > 60 || care.adultCm > 7)) return false;
    return item.variants.some(row => row.stock >= row.minQty && row.unitPrice * row.minQty <= limit);
  });
}

async function openHandoff(psid: string, lastMessage: string, reason: string) {
  return db.$transaction(async tx => {
    await tx.conversationState.upsert({ where: { psid }, create: { psid, handoff: true },
      update: { handoff: true, selection: Prisma.DbNull } });
    return await tx.handoffRequest.findFirst({ where: { psid, status: 'OPEN' } }) ??
      tx.handoffRequest.create({ data: { psid, lastMessage, reason } });
  });
}

export async function handleMessage(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.parse(input);
  const { mid, psid, text: raw, aiQuery } = parsed;
  try { await db.messengerReceipt.create({ data: { mid } }); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { ignored: true };
    throw error;
  }
  const state = await db.conversationState.upsert({ where: { psid },
    create: { psid, lastInboundAt: new Date() }, update: { lastInboundAt: new Date() } });
  const phrase = customerPhrase(raw);
  const intent = intentFor(phrase, !!parsed.attachmentType);
  if (state.handoff && intent !== 'resume') return { ignored: true };
  await sendTyping(psid);
  const selection = (state.selection ?? {}) as Selection;
  const reply = async (messages: Record<string, unknown>[], next?: Selection, unknownCount = 0) => {
    await db.conversationState.update({ where: { psid }, data: { selection: next ?? Prisma.DbNull, unknownCount } });
    const hours = businessHours();
    if (!hours.open && intent !== 'greeting') messages.unshift(text('Hiện ngoài giờ hỗ trợ: ' + hours.label + '. Bot vẫn hỗ trợ xem và đặt hàng.', []));
    for (const message of messages) await sendMessenger(psid, message);
    return { replied: true, intent };
  };
  const handoff = async (reason: string) => {
    const request = await openHandoff(psid, raw, reason);
    const hours = businessHours();
    await sendMessenger(psid, text('Đã chuyển cho nhân viên. ' + (hours.open ? 'Bạn có thể để lại lời nhắn trong lúc chờ.' : 'Hiện ngoài giờ làm việc. Giờ hỗ trợ: ' + hours.label + '.') + ' Gõ “quay lại bot” để tự xem sản phẩm.', ['Quay lại bot']));
    return { intent, handoff: { id: request.id, psid, reason } };
  };
  if (intent === 'resume') {
    await db.$transaction(async tx => {
      await tx.conversationState.update({ where: { psid }, data: { handoff: false, unknownCount: 0, selection: Prisma.DbNull } });
      await tx.handoffRequest.updateMany({ where: { psid, status: 'OPEN' }, data: { status: 'DONE' } });
    });
    return reply([text('Đã quay lại bot Long Fish. Bạn muốn xem mẫu nào?')]);
  }
  if (intent === 'unsafe') return handoff('Yêu cầu thay đổi chính sách/giá hoặc nội dung không an toàn; bot không thực hiện');
  if (intent === 'human') return handoff('Khách yêu cầu gặp nhân viên');
  if (intent === 'promotion') return handoff('Chưa có dữ liệu khuyến mãi xác minh; nhân viên kiểm tra, bot không xác nhận giảm giá');
  if (intent === 'attachment') return reply([text('Mình đã nhận ' + (parsed.attachmentType === 'location' ? 'vị trí' : 'ảnh/sticker') + '. Bot chưa nhận diện nội dung này. Bạn gõ tên cá hoặc chọn Gặp nhân viên để kiểm tra nhé.')]);
  if (intent === 'shipping') {
    if (/bao lau|may ngay|ngay mai|hom nay.*nhan/.test(phrase)) return handoff('Cần nhân viên xác nhận lịch giao, bot không hứa thời gian');
    return reply([text((liveEverywhere ? 'Long Fish giao cá sống toàn quốc.' : 'Cá sống chỉ giao trong vùng: ' + liveProvinces.join(', ') + '.') + ' Phí giao và đóng gói được tính theo địa chỉ/giỏ trên website. ' + doaPolicy)]);
  }
  const orderCode = raw.match(/\bDH\d{8}-\d{4,10}\b/i)?.[0].toUpperCase();
  if (orderCode || selection.code) {
    const code = orderCode || selection.code!;
    const number = phone.safeParse(raw.replace(/\bDH\d{8}-\d{4,10}\b/i, '').trim());
    if (!number.success) return reply([text('Bạn gửi số điện thoại đặt đơn ' + code + ' để mình kiểm tra nhé.', [])], { code });
    try {
      const order = await trackOrder(code, number.data);
      return reply([text(code + ' · ' + statusLabels[order.status] + '. Tổng tiền ' + money(order.total) + '.')]);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      return reply([text('Mã đơn và số điện thoại chưa khớp. Bạn kiểm tra lại nhé.')], { code });
    }
  }
  if (intent === 'track') return reply([text('Bạn gửi mã đơn để tra cứu nhé.')]);
  const catalog = await products();
  if (intent === 'greeting') {
    const welcome = text('Chào bạn, Long Fish đây 🐟 Bạn muốn xem cá cảnh, cây thủy sinh hay thiết bị cho bể?');
    const hours = businessHours();
    if (!hours.open) welcome.text += '\nHiện ngoài giờ hỗ trợ: ' + hours.label + '. Bạn vẫn có thể xem và đặt hàng trên website.';
    return reply(catalog.length ? [welcome, carousel(catalog, psid)] : [welcome]);
  }

  let product = selection.slug ? catalog.find(row => row.slug === selection.slug) : undefined;
  const explicit = catalog.find(row => phrase.includes(normalize(row.name)));
  const picked = /^\d+$/.test(phrase) && !selection.slug
    ? catalog.find(row => row.slug === selection.candidates?.[Number(phrase) - 1]) : undefined;
  const wantsCare = intent === 'care';
  const wantsStock = intent === 'stock';
  const wantsSelection = /\b(dat|mua|dong|mau|co|gioi tinh|so luong)\b/.test(phrase);
  const discovery = ['recommend','price','photo'].includes(intent);
  const recommend = /\b(goi y|de nuoi|an reu|an tao|be nho|de ban|nguoi moi|duoi|nuoi duoc gi|nuoi chung|ngan sach)\b/.test(phrase);
  if (explicit || picked) product = explicit || picked;
  if (recommend && !explicit) product = undefined;

  const present = (matches: Product[], message: string) => {
    const options = matches.slice(0, 6);
    return reply([carousel(options, psid), text(message + '\n' + options.map((row, i) =>
      (i + 1) + '. ' + row.name).join('\n'), options.map((_, i) => String(i + 1)).concat(choices))],
      { candidates: options.map(row => row.slug) });
  };

  if (!product && (discovery || wantsStock || wantsSelection || wantsCare || aiQuery)) {
    const query = discovery || wantsStock || wantsSelection || wantsCare ? phrase : normalize(aiQuery || '');
    const matches = candidatesFrom(catalog, query, discovery || wantsStock || wantsSelection || wantsCare ? raw : (aiQuery || ''));
    if (wantsCare && !recommend && matches.length === 1) product = matches[0];
    else if (matches.length) return present(matches, 'Chọn số của mẫu bạn muốn hỏi hoặc đặt.');
    else return handoff('Chưa có dữ liệu sản phẩm/tồn kho phù hợp với yêu cầu');
  }

  if (product) {
    const next: Selection = selection.slug === product.slug ? { ...selection } : { slug: product.slug };
    if (intent === 'price') return reply([text(product.name + ' · Giá niêm yết ' + money(product.price) + (product.onSale ? ', đang giảm còn ' + money(product.currentPrice) : '') + '. Giá theo phân loại được xác nhận ở trang đặt hàng.')], next);
    if (intent === 'photo') return reply([carousel([product], psid), text('Ảnh tham khảo của ' + product.name + '. SVG trên website có nhãn Ảnh minh họa; chọn Xem & đặt hàng để xem nguồn ảnh.')], next);
    if (wantsCare) {
      const care = careInfo.safeParse(product.careInfo);
      if (!care.success) return handoff('Thiếu thông số chăm sóc của sản phẩm');
      const info = care.data;
      return reply([text(product.name + ' · Thông số tham khảo\nNhiệt độ: ' + info.temperature + ' · pH: ' + info.ph +
        '\nBể tham khảo: từ ' + info.minTankLiters + ' L, tùy số cá và bố trí.\n' + info.temperament + '\nThức ăn: ' + info.food)], next);
    }
    const available = product.variants.filter(row => row.stock >= row.minQty);
    const alternatives = () => {
      if (available.length) {
        const values = available.slice(0, 4).map(row => row.color + ' / ' + row.size + ' / ' + row.gender).join('\n');
        return reply([text('Lựa chọn này đã hết hoặc dưới lượng bán tối thiểu. Phân loại còn bán:\n' + values,
          [...new Set(available.map(row => row.color))].concat(choices))], { slug: product.slug });
      }
      const similar = catalog.filter(row => row.id !== product.id && row.category === product.category &&
        row.variants.some(variant => variant.stock >= variant.minQty));
      return similar.length ? present(similar, 'Mẫu này đã hết. Bạn có thể xem các mẫu cùng nhóm:') :
        reply([text('Mẫu này đã hết. Chọn Gặp nhân viên để hỏi lịch về hàng.')]);
    };
    const colors = [...new Set(product.variants.map(row => row.color))];
    const color = colors.find(value => phrase === normalize(value) || phrase === 'mau ' + normalize(value));
    if (color && next.color !== color) { next.color = color; delete next.size; delete next.gender; }
    const colorRows = product.variants.filter(row => row.color === next.color);
    const sizes = [...new Set(colorRows.map(row => row.size))];
    const size = sizes.find(value => phrase === normalize(value) || phrase === 'co ' + normalize(value));
    if (size && next.size !== size) { next.size = size; delete next.gender; }
    const sizeRows = colorRows.filter(row => row.size === next.size);
    const genders = [...new Set(sizeRows.map(row => row.gender))];
    const gender = genders.find(value => phrase === normalize(value) || phrase === 'gioi tinh ' + normalize(value));
    if (gender) next.gender = gender;
    const quantity = next.gender && /^\d{1,2}$/.test(phrase) ? Number(phrase) : 0;
    if (wantsStock) {
      const inventory = await stock(product.id, next.color, next.size, next.gender);
      if (!inventory.inStock) return alternatives();
      return reply([text(product.name + ' còn ' + inventory.stock + ' đơn vị theo lựa chọn. Chọn dòng/màu để kiểm tra cụ thể.', colors.concat(choices))], next);
    }
    if (!available.length) return alternatives();
    if (!explicit && !picked && !wantsSelection && !color && !size && !gender && !quantity) {
      if (state.unknownCount >= 1) return handoff('Bot chưa hiểu hai tin liên tiếp');
      return reply([text('Bạn thử chọn dòng/màu, cỡ, giới tính hoặc số lượng theo gợi ý nhé.')], next, 1);
    }
    if (!next.color) return reply([text('Bạn chọn dòng/màu của ' + product.name + ' nhé.', colors.concat(choices))], next);
    if (!next.size) return reply([text('Bạn chọn cỡ cho màu ' + next.color + '.', sizes.concat(choices))], next);
    if (!next.gender) return reply([text('Bạn chọn giới tính cho phân loại này.', genders.concat(choices))], next);
    const variant = sizeRows.find(row => row.gender === next.gender);
    if (!variant || variant.stock < variant.minQty) return alternatives();
    if (quantity < variant.minQty || quantity > variant.stock) return reply([text('Mua tối thiểu ' + variant.minQty +
      ' ' + variant.unit + ', hiện còn ' + variant.stock + '. Bạn muốn đặt bao nhiêu?',
      Array.from({ length: Math.min(5, variant.stock - variant.minQty + 1, 100 - variant.minQty) },
        (_, i) => String(i + variant.minQty)).concat(choices))], next);
    const url = new URL(messengerLink('/san-pham/' + product.slug, psid));
    url.searchParams.set('variant', variant.id);
    url.searchParams.set('quantity', String(quantity));
    return reply([text(product.name + ' · ' + variant.color + ' / ' + variant.size + ' / ' + variant.gender +
      ' × ' + quantity + ' ' + variant.unit + '\nBạn mở link để chốt đơn: ' + url)]);
  }
  if (state.unknownCount >= 1) return handoff('Bot chưa hiểu hai tin liên tiếp');
  return reply([text('Mình chưa hiểu. Bạn thử hỏi tên sản phẩm, giá hoặc chọn danh mục nhé.')], undefined, 1);
}

export { inputSchema as botInput, openHandoff };


