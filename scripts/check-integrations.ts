import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { sheetsRequest, sheetsToken } from './sheets';
import { thumbnailPath } from '../backend/src/image-path';

const results: { name: string; status: string; note: string }[] = [];
const base = process.env.CHECK_BASE_URL || 'http://127.0.0.1:8080';
async function check(name: string, action: () => Promise<string>) {
  try { results.push({ name, status: 'OK', note: await action() }); }
  catch (error) { results.push({ name, status: 'FAIL', note: (error as Error).message }); process.exitCode = 1; }
}
async function http(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response;
}
async function main() {
  await check('DB', async () => { await http(base + '/api/health'); return 'API kết nối database thành công.'; });
  await check('Ảnh', async () => {
    const credits = await (await http(base + '/catalog/photos/credits.json')).json() as Record<string, { file: string }[]>;
    const products = await (await http(base + '/api/products')).json() as { images: string[] }[];
    const paths = new Set([...Object.values(credits).flat().map(row => row.file), ...products.flatMap(product => product.images)]);
    for (const path of paths) {
      if (!path.startsWith('/')) continue;
      for (const file of new Set([path, thumbnailPath(path)])) {
        const response = await http(base + file);
        const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.webp') ? 'image/webp' : 'image/';
        if (!response.headers.get('Content-Type')?.includes(type)) throw new Error('Content-Type ảnh không hợp lệ.');
        await response.body?.cancel();
      }
    }
    return 'Đã mở ảnh local của sản phẩm, ảnh đã ghi nguồn và thumbnail.';
  });
  await check('n8n', async () => { await http((process.env.CHECK_N8N_URL || 'http://127.0.0.1:5678') + '/healthz/readiness'); return 'Sẵn sàng.'; });
  await check('Messenger', async () => {
    if (!process.env.META_PAGE_ACCESS_TOKEN) throw new Error('Chưa cấu hình token, chưa kiểm chứng Meta thật.');
    const version = process.env.META_GRAPH_VERSION || 'v23.0';
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('Graph version không hợp lệ.');
    await http('https://graph.facebook.com/' + version + '/me?fields=id,name', { Authorization: 'Bearer ' + process.env.META_PAGE_ACCESS_TOKEN });
    return 'Token đọc được Fanpage. Chưa xác nhận quyền gửi tới khách.';
  });
  await check('Sheets', async () => { await sheetsRequest(await sheetsToken()); return 'Service Account đọc được Sheet.'; });
  await check('SMTP', async () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) throw new Error('Chưa cấu hình SMTP, chưa kiểm chứng email thật.');
    const nodemailer = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }, connectionTimeout: 15000, socketTimeout: 15000 });
    try { await transport.verify(); } finally { transport.close(); }
    return 'SMTP xác thực được. Cần tự kiểm tra hộp thư sau một đơn thử.';
  });
  if (process.argv.includes('--docker')) await check('CSV mock', async () => {
    execFileSync('docker', ['compose', 'exec', '-T', 'backend', 'node', '-e', "require('node:fs').accessSync('/data/mock/Long_Fish_Orders.csv')"], { stdio: 'pipe' });
    return 'Tệp CSV đơn hàng tồn tại trong container.';
  });
  for (const row of results) console.log(row.status + ' · ' + row.name + ' · ' + row.note);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
