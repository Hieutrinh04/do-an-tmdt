import { beforeEach, expect, test, vi } from 'vitest';

const handle = vi.hoisted(() => vi.fn(async (_input: unknown) => ({ replied: true })));
vi.mock('../src/comments', () => ({ handleComment: handle }));

process.env.META_PAGE_ACCESS_TOKEN = 'test-token';
process.env.META_GRAPH_VERSION = 'v23.0';
process.env.COMMENT_POLL_LOOKBACK_MINUTES = '30';
process.env.COMMENT_POLL_POSTS = '5';

const now = Date.parse('2026-11-10T12:40:00Z');
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeGraph(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    const target = String(url);
    calls.push(target);
    for (const [needle, body] of Object.entries(routes)) if (target.includes(needle)) return body instanceof Response ? body : json(body);
    return json({ error: { code: 100 } }, 404);
  }) as typeof fetch;
  return { fetcher, calls };
}

beforeEach(() => handle.mockClear());

test('chỉ xử lý bình luận trong khoảng thời gian gần, bỏ bình luận cũ, truyền đủ thông tin cho handleComment', async () => {
  const { fetcher } = fakeGraph({
    '/me/posts': { data: [{ id: '999_111' }] },
    '/999_111/comments': { data: [
      { id: '999_111_c1', message: 'Betta giá sao', created_time: iso(3), from: { id: '555', name: 'Trịnh Hiếu' } },
      { id: '999_111_c0', message: 'bình luận cũ', created_time: iso(600), from: { id: '556', name: 'Người Khác' } },
    ] },
  });
  const { pollComments } = await import('../src/comment-poller');
  const summary = await pollComments({ now, fetcher });
  expect(summary).toMatchObject({ checked: 1, replied: 1, failed: 0 });
  expect(handle).toHaveBeenCalledOnce();
  expect(handle).toHaveBeenCalledWith({ commentId: '999_111_c1', postId: '999_111', pageId: '999', fromId: '555', fromName: 'Trịnh Hiếu', text: 'Betta giá sao' });
});

test('chỉ lấy bình luận gốc (filter=toplevel) và dùng token Trang trong header, không đưa token lên URL', async () => {
  const { fetcher, calls } = fakeGraph({ '/me/posts': { data: [{ id: '999_111' }] }, '/999_111/comments': { data: [] } });
  const { pollComments } = await import('../src/comment-poller');
  await pollComments({ now, fetcher });
  expect(calls.some(url => url.includes('filter=toplevel'))).toBe(true);
  expect(calls.every(url => !url.includes('test-token'))).toBe(true);
});

test('một bài lỗi (Meta 4xx) không làm hỏng các bài còn lại', async () => {
  const { fetcher } = fakeGraph({
    '/me/posts': { data: [{ id: '999_1' }, { id: '999_2' }] },
    '/999_1/comments': new Response(JSON.stringify({ error: { code: 10 } }), { status: 400 }),
    '/999_2/comments': { data: [{ id: '999_2_c', message: 'ib', created_time: iso(1), from: { id: '7', name: 'A B' } }] },
  });
  const { pollComments } = await import('../src/comment-poller');
  const summary = await pollComments({ now, fetcher });
  expect(summary).toMatchObject({ checked: 1, replied: 1, failed: 1 });
});

test('handleComment ném lỗi thì bộ quét ghi nhận lỗi và tiếp tục bình luận khác', async () => {
  handle.mockRejectedValueOnce(new Error('fetch failed'));
  const { fetcher } = fakeGraph({
    '/me/posts': { data: [{ id: '999_1' }] },
    '/999_1/comments': { data: [
      { id: '999_1_a', message: 'x', created_time: iso(2), from: { id: '1', name: 'A' } },
      { id: '999_1_b', message: 'y', created_time: iso(2), from: { id: '2', name: 'B' } },
    ] },
  });
  const { pollComments } = await import('../src/comment-poller');
  expect(await pollComments({ now, fetcher })).toMatchObject({ checked: 2, replied: 1, failed: 1 });
});
