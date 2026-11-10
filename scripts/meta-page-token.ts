// Đổi "User token" ngắn hạn (lấy từ Graph API Explorer) thành Page token KHÔNG HẾT HẠN có đủ quyền, rồi ghi vào .env.
// Cách dùng: lưu user token vào file data/user-token.txt (một dòng), chạy: npx tsx scripts/meta-page-token.ts
// Script không in token hay secret; chỉ in tên các quyền. Xong sẽ xóa file data/user-token.txt.
import 'dotenv/config';
import { readFile, unlink, writeFile } from 'node:fs/promises';

const graph = 'https://graph.facebook.com/' + (/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || '') ? process.env.META_GRAPH_VERSION : 'v23.0');
const tokenFile = 'data/user-token.txt';

async function call<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const body = await response.json() as T & { error?: { message?: string; code?: number } };
  if (!response.ok || body.error) throw new Error('Meta lỗi HTTP ' + response.status + (body.error ? ' (mã ' + body.error.code + '): ' + body.error.message : ''));
  return body;
}

async function main() {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!secret) throw new Error('Thiếu META_APP_SECRET trong .env');
  const shortLived = (await readFile(tokenFile, 'utf8')).trim();
  if (!/^EA[A-Za-z0-9]{50,}$/.test(shortLived)) throw new Error('Nội dung ' + tokenFile + ' không giống token Meta.');

  // Lấy App ID từ chính token nếu .env chưa có META_APP_ID.
  const id = appId || (await call<{ id: string }>(graph + '/app?fields=id', { Authorization: 'Bearer ' + shortLived })).id;

  const exchange = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: shortLived });
  const longLived = (await call<{ access_token: string }>(graph + '/oauth/access_token?' + exchange)).access_token;

  const pageId = process.env.META_PAGE_ID || '476974172163948';
  const accounts = await call<{ data: { id: string; name: string; access_token: string }[] }>(
    graph + '/me/accounts?fields=id,name,access_token&limit=100', { Authorization: 'Bearer ' + longLived });
  const page = accounts.data.find(row => row.id === pageId);
  if (!page) throw new Error('Không thấy Page ' + pageId + ' trong danh sách Page của tài khoản này (' + accounts.data.map(row => row.name).join(', ') + ').');

  const debug = await call<{ data: { type?: string; expires_at?: number; scopes?: string[] } }>(
    graph + '/debug_token?' + new URLSearchParams({ input_token: page.access_token, access_token: id + '|' + secret }));
  const scopes = debug.data.scopes || [];
  console.log('Page:', page.name, '| loại:', debug.data.type, '| hết hạn:', debug.data.expires_at ? new Date(debug.data.expires_at * 1000).toISOString() : 'không hết hạn');
  console.log('quyền:', scopes.join(', '));
  // pages_read_user_content: cần để Meta gửi sự kiện bình luận của người dùng (webhook feed) và cho phép đọc bình luận.
  const required = ['pages_messaging', 'pages_read_engagement', 'pages_read_user_content'];
  const missing = required.filter(name => !scopes.includes(name));
  if (missing.length) throw new Error('Token mới vẫn thiếu: ' + missing.join(', ') + '. Chưa ghi vào .env.');

  const env = await readFile('.env', 'utf8');
  if (!/^META_PAGE_ACCESS_TOKEN=.*$/m.test(env)) throw new Error('Không thấy dòng META_PAGE_ACCESS_TOKEN trong .env');
  await writeFile('.env', env.replace(/^META_PAGE_ACCESS_TOKEN=.*$/m, () => 'META_PAGE_ACCESS_TOKEN=' + page.access_token));
  await unlink(tokenFile);
  console.log('Đã ghi Page token mới vào .env và xóa', tokenFile + '. Chạy: docker compose up -d');
}
main().catch(error => { console.error('LỖI:', error instanceof Error ? error.message : error); process.exit(1); });
