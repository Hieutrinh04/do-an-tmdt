import 'dotenv/config';
import { createHmac, randomUUID } from 'node:crypto';

async function main() {
  const args = process.argv.slice(2);
  const messages: string[] = [];
  let psid = process.env.SIMULATE_PSID || '100000000001';
  let duplicate = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--psid') psid = args[++i] || '';
    else if (args[i] === '--duplicate') duplicate = true;
    else messages.push(args[i]);
  }
  if (!/^\d{1,40}$/.test(psid)) throw new Error('PSID phải gồm 1–40 chữ số.');
  const url = process.env.SIMULATE_MESSENGER_URL || 'http://localhost:5678/webhook/messenger';
  for (const text of messages.length ? messages : ['Xin chào', 'Cá dễ nuôi cho người mới', '1', 'Đỏ', '3–4 cm', 'Đực', '2']) {
    const body = JSON.stringify({ object: 'page', entry: [{ id: '10001', time: Date.now(), messaging: [{
      sender: { id: psid }, recipient: { id: '10001' }, timestamp: Date.now(),
      message: { mid: 'mock-' + randomUUID(), text },
    }] }] });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.META_APP_SECRET) {
      headers['x-hub-signature-256'] = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex');
    }
    for (let count = 0; count < (duplicate ? 2 : 1); count++) {
      const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Webhook trả HTTP ' + response.status + ' · ' + await response.text());
      console.info(psid, text, '→', await response.text());
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
