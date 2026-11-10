import { env, mock } from './env';
import { handleComment } from './comments';

// Dự phòng cho webhook "feed" của Meta: mỗi vài chục giây đọc bình luận mới dưới các bài viết gần nhất của Page
// rồi đưa qua cùng bộ xử lý với webhook. handleComment chống trùng theo mã bình luận nên dùng cả hai cùng lúc vẫn an toàn.

type Fetcher = typeof fetch;
type Post = { id: string };
type Comment = { id: string; message?: string; created_time?: string; from?: { id?: string; name?: string } };

const graphBase = () => 'https://graph.facebook.com/' + (/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION || '') ? env.META_GRAPH_VERSION : 'v23.0');

async function graph<T>(fetcher: Fetcher, path: string): Promise<T> {
  const response = await fetcher(graphBase() + path, {
    headers: { Authorization: 'Bearer ' + env.META_PAGE_ACCESS_TOKEN }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { code?: number } };
    throw new Error('Graph ' + path.split('?')[0].replace(/\d{6,}/g, '…') + ' trả HTTP ' + response.status + ' (mã ' + (body.error?.code ?? '?') + ')');
  }
  return await response.json() as T;
}

export async function pollComments(options: { now?: number; fetcher?: Fetcher } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  const lookbackMs = (Number(env.COMMENT_POLL_LOOKBACK_MINUTES) > 0 ? Number(env.COMMENT_POLL_LOOKBACK_MINUTES) : 30) * 60_000;
  const postLimit = Number(env.COMMENT_POLL_POSTS) > 0 ? Math.min(Number(env.COMMENT_POLL_POSTS), 25) : 10;
  const summary = { checked: 0, replied: 0, skipped: 0, failed: 0 };

  const posts = (await graph<{ data?: Post[] }>(fetcher, '/me/posts?fields=id&limit=' + postLimit)).data || [];
  for (const post of posts) {
    let comments: Comment[] = [];
    try {
      comments = (await graph<{ data?: Comment[] }>(fetcher,
        '/' + encodeURIComponent(post.id) + '/comments?filter=toplevel&order=reverse_chronological&limit=15&fields=id,message,created_time,from')).data || [];
    } catch (error) { console.warn('[Comment poll]', error instanceof Error ? error.message : error); summary.failed++; continue; }

    for (const comment of comments) {
      const created = comment.created_time ? Date.parse(comment.created_time) : NaN;
      if (!Number.isFinite(created) || now - created > lookbackMs) continue;
      summary.checked++;
      try {
        const result = await handleComment({
          commentId: comment.id, postId: post.id, pageId: post.id.split('_')[0],
          fromId: comment.from?.id, fromName: comment.from?.name, text: comment.message || '',
        });
        if (result.replied) summary.replied++; else summary.skipped++;
        if (result.replied) console.info('[Comment poll] đã nhắn riêng cho bình luận', comment.id.slice(-8));
      } catch (error) {
        summary.failed++;
        console.warn('[Comment poll] gửi tin riêng lỗi', comment.id.slice(-8), error instanceof Error ? error.message : error);
      }
    }
  }
  return summary;
}

export function startCommentPoller() {
  if (mock || env.COMMENT_POLL_ENABLED === 'false' || env.COMMENT_AUTOREPLY_ENABLED === 'false' || !env.META_PAGE_ACCESS_TOKEN) return () => {};
  const intervalMs = Math.max(20, Number(env.COMMENT_POLL_SECONDS) || 60) * 1000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await pollComments(); }
    catch (error) { console.warn('[Comment poll]', error instanceof Error ? error.message : error); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  setTimeout(() => void tick(), 5000);
  console.info('[Comment poll] quét bình luận mới mỗi ' + intervalMs / 1000 + ' giây');
  return () => clearInterval(timer);
}
