import { z } from 'zod';
import { db } from './db';
import { env } from './env';
import { normalize } from './domain';
import { products } from './catalog';
import { sendPrivateReply } from './messenger';

export const commentInput = z.object({
  commentId: z.string().regex(/^[\w-]{1,80}$/),
  postId: z.string().max(80).optional(),
  pageId: z.string().max(40).optional(),
  fromId: z.string().max(40).optional(),
  fromName: z.string().max(120).optional(),
  text: z.string().max(2000).default(''),
});

const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
const prefix = 'comment-';

function keywords() {
  return (env.COMMENT_KEYWORDS || '').split(',').map(value => normalize(value)).filter(Boolean);
}

// Tên người Việt: lấy từ cuối làm tên gọi; bỏ ký tự lạ để không chèn nội dung vào tin nhắn.
function callName(fromName?: string) {
  const parts = (fromName || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].slice(0, 30) : '';
}

export async function handleComment(input: z.infer<typeof commentInput>) {
  if (env.COMMENT_AUTOREPLY_ENABLED === 'false') return { replied: false, reason: 'disabled' };
  if (input.pageId && input.fromId && input.pageId === input.fromId) return { replied: false, reason: 'own_comment' };

  const phrase = normalize(input.text);
  const words = keywords();
  if (words.length && !words.some(word => phrase.includes(word))) return { replied: false, reason: 'no_keyword' };

  const limit = Number(env.COMMENT_MAX_PER_HOUR) > 0 ? Number(env.COMMENT_MAX_PER_HOUR) : 60;
  const recent = await db.messengerReceipt.count({
    where: { mid: { startsWith: prefix }, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= limit) return { replied: false, reason: 'rate_limited' };

  // Mỗi bình luận chỉ được trả lời riêng một lần: ghi nhận trước để tránh gửi trùng khi Meta gọi lại webhook.
  try { await db.messengerReceipt.create({ data: { mid: prefix + input.commentId } }); }
  catch { return { replied: false, reason: 'duplicate' }; }

  const site = (env.SITE_URL || 'http://localhost:8080').replace(/\/$/, '');
  const catalog = await products();
  const matched = phrase ? catalog.find(item => phrase.includes(normalize(item.name))) : undefined;
  const name = callName(input.fromName);
  const lines = [
    'Chào' + (name ? ' ' + name : ' bạn') + ', Long Fish cảm ơn bạn đã quan tâm 🐟',
    matched
      ? matched.name + ' hiện có giá từ ' + money(matched.price) + '. Xem chi tiết và đặt hàng: ' + site + '/product/' + matched.slug
      : 'Bạn đang tìm cá hay phụ kiện nào? Xem sản phẩm tại: ' + site,
    'Bạn nhắn lại tin này, Long Fish sẽ tư vấn cá hợp với bể của bạn và gửi link chốt đơn nhé.',
  ];
  try {
    const result = await sendPrivateReply(input.commentId, lines.join('\n'));
    return { replied: true, product: matched?.slug, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Lỗi tạm thời (mạng, Meta 5xx): bỏ dấu "đã xử lý" để lần quét sau thử lại.
    // Lỗi Meta từ chối (4xx: đã trả lời rồi, quá 7 ngày, người dùng chặn Page…): giữ nguyên để không gửi lặp.
    if (!/HTTP 4\d\d/.test(message)) {
      await db.messengerReceipt.delete({ where: { mid: prefix + input.commentId } }).catch(() => undefined);
      throw error;
    }
    console.warn('[Comment] Meta từ chối tin riêng cho', input.commentId.slice(-8), message);
    return { replied: false, reason: 'meta_rejected', detail: message.slice(0, 160) };
  }
}
