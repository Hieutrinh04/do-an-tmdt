import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const reply = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
vi.mock('../src/messenger', () => ({ sendPrivateReply: reply }));

const filename = 'comment-test-' + randomUUID() + '.db';
process.env.DATABASE_URL = 'file:./' + filename;
process.env.SEED_DEMO = 'true';
process.env.MOCK_INTEGRATIONS = 'true';
process.env.SITE_URL = 'https://long-fish.example';
process.env.COMMENT_KEYWORDS = '';
process.env.COMMENT_MAX_PER_HOUR = '3';
process.env.COMMENT_AUTOREPLY_ENABLED = 'true';
delete process.env.ADMIN_PASSWORD;

let db: typeof import('../src/db').db;
let handleComment: typeof import('../src/comments').handleComment;

beforeAll(async () => {
  db = (await import('../src/db')).db;
  for (const dir of readdirSync('prisma/migrations').filter(x => /^\d/.test(x)).sort()) {
    for (const sql of readFileSync('prisma/migrations/' + dir + '/migration.sql', 'utf8').split(';').map(x => x.trim()).filter(Boolean)) await db.$executeRawUnsafe(sql);
  }
  await (await import('../prisma/seed')).seed();
  handleComment = (await import('../src/comments')).handleComment;
}, 30000);

beforeEach(async () => {
  reply.mockClear();
  process.env.COMMENT_KEYWORDS = '';
  process.env.COMMENT_AUTOREPLY_ENABLED = 'true';
  await db.messengerReceipt.deleteMany({ where: { mid: { startsWith: 'comment-' } } });
});

afterAll(async () => {
  await db.$disconnect();
  for (const suffix of ['', '-journal']) { try { unlinkSync(resolve('prisma', filename + suffix)); } catch { /* không có file */ } }
});

const comment = (extra: Record<string, unknown> = {}) => ({ commentId: randomUUID().replace(/-/g, '').slice(0, 20), fromId: '111', fromName: 'Nguyễn Minh An', pageId: '999', text: 'Giá sao shop', ...extra });

test('bình luận thường: nhắn riêng lời chào có link cửa hàng, gọi bằng tên', async () => {
  const input = comment();
  expect(await handleComment(input)).toMatchObject({ replied: true });
  expect(reply).toHaveBeenCalledOnce();
  const [id, text] = reply.mock.calls[0] as unknown as [string, string];
  expect(id).toBe(input.commentId);
  expect(text).toContain('Chào An');
  expect(text).toContain('https://long-fish.example');
});

test('bình luận nhắc tên sản phẩm: gửi giá và link sản phẩm lấy từ database', async () => {
  const result = await handleComment(comment({ text: 'Betta Halfmoon còn không ạ' }));
  expect(result).toMatchObject({ replied: true, product: 'betta-halfmoon' });
  const text = (reply.mock.calls[0] as unknown as [string, string])[1];
  expect(text).toContain('/san-pham/betta-halfmoon');
  const product = await (await import('../src/catalog')).detail('betta-halfmoon');
  expect(text).toContain(new Intl.NumberFormat('vi-VN').format(product.currentPrice));
});

test('mỗi bình luận chỉ trả lời một lần, Meta gọi lại webhook không gửi trùng', async () => {
  const input = comment();
  expect(await handleComment(input)).toMatchObject({ replied: true });
  expect(await handleComment(input)).toMatchObject({ replied: false, reason: 'duplicate' });
  expect(reply).toHaveBeenCalledOnce();
});

test('không tự trả lời bình luận của chính Page', async () => {
  expect(await handleComment(comment({ fromId: '999', pageId: '999' }))).toMatchObject({ replied: false, reason: 'own_comment' });
  expect(reply).not.toHaveBeenCalled();
});

test('COMMENT_KEYWORDS: chỉ trả lời bình luận có từ khóa, không phân biệt dấu', async () => {
  process.env.COMMENT_KEYWORDS = 'giá, ib, còn hàng';
  expect(await handleComment(comment({ text: 'đẹp quá' }))).toMatchObject({ replied: false, reason: 'no_keyword' });
  expect(await handleComment(comment({ text: 'GIA bao nhieu vay' }))).toMatchObject({ replied: true });
  expect(await handleComment(comment({ text: 'con nay con hang khong' }))).toMatchObject({ replied: true });
  expect(reply).toHaveBeenCalledTimes(2);
});

test('giới hạn số tin mỗi giờ để tránh spam', async () => {
  for (let i = 0; i < 3; i++) expect(await handleComment(comment())).toMatchObject({ replied: true });
  expect(await handleComment(comment())).toMatchObject({ replied: false, reason: 'rate_limited' });
  expect(reply).toHaveBeenCalledTimes(3);
});

test('COMMENT_AUTOREPLY_ENABLED=false tắt hoàn toàn', async () => {
  process.env.COMMENT_AUTOREPLY_ENABLED = 'false';
  expect(await handleComment(comment())).toMatchObject({ replied: false, reason: 'disabled' });
  expect(reply).not.toHaveBeenCalled();
});

test('tên có ký tự lạ không chèn được vào nội dung tin nhắn', async () => {
  await handleComment(comment({ fromName: 'Hacker <script>alert(1)</script> http://evil.example' }));
  const text = (reply.mock.calls[0] as unknown as [string, string])[1];
  expect(text).not.toContain('<');
  expect(text).not.toContain('evil');
});

test('Meta từ chối (4xx) thì không gửi lặp; lỗi tạm thời (mạng) thì được thử lại ở lần quét sau', async () => {
  reply.mockRejectedValueOnce(new Error('Private Reply trả HTTP 400 (mã 10/2018292)'));
  const rejected = comment();
  expect(await handleComment(rejected)).toMatchObject({ replied: false, reason: 'meta_rejected' });
  expect(await handleComment(rejected)).toMatchObject({ replied: false, reason: 'duplicate' });

  reply.mockRejectedValueOnce(new Error('fetch failed'));
  const transient = comment();
  await expect(handleComment(transient)).rejects.toThrow('fetch failed');
  expect(await handleComment(transient)).toMatchObject({ replied: true });
});
