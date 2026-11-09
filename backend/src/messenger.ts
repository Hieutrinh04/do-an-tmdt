import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, mock } from './env';
import { db } from './db';

export function equalSecret(expected: string | undefined, received: string | undefined) {
  if (!expected || !received) return false;
  const first = Buffer.from(expected);
  const second = Buffer.from(received);
  return first.length === second.length && timingSafeEqual(first, second);
}

function contextSignature(psid: string) {
  return createHmac('sha256', env.INTERNAL_API_KEY || '').update('messenger:' + psid).digest('hex');
}

export function messengerLink(path: string, psid: string) {
  const url = new URL(path, env.SITE_URL || 'http://localhost:8080');
  url.searchParams.set('psid', psid);
  if (!mock) url.searchParams.set('context', contextSignature(psid));
  return url.toString();
}

export function trustedPsid(psid?: string, context?: string) {
  return psid && (mock || (env.INTERNAL_API_KEY && equalSecret(contextSignature(psid), context))) ? psid : undefined;
}

export async function sendMessenger(psid: string, message: Record<string, unknown>) {
  if (mock) {
    console.info('[Messenger mock]', JSON.stringify({ psid: psid.slice(0, 4) + '***', message })
      .replace(/(?:\+84|0)[35789]\d{8}\b/g, '[SĐT đã che]'));
    return;
  }
  const token = env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('META_PAGE_ACCESS_TOKEN chưa cấu hình.');
  const state = await db.conversationState.findUnique({ where: { psid } });
  if (!state?.lastInboundAt || Date.now() - state.lastInboundAt.getTime() >= 24 * 60 * 60 * 1000) {
    const reason = 'Thông báo ngoài cửa sổ Messenger 24 giờ, cần liên hệ qua kênh được khách đồng ý';
    const existing = await db.handoffRequest.findFirst({ where: { psid, reason, status: 'OPEN' } });
    if (!existing) await db.handoffRequest.create({ data: { psid, reason,
      lastMessage: typeof message.text === 'string' ? message.text.slice(0, 2000) : 'Thông báo đơn hàng cần gửi thủ công.' } });
    return { sent: false, fallback: 'admin', reason: 'outside_24h' };
  }
  const version = /^v\d+\.\d+$/.test(env.META_GRAPH_VERSION || '') ? env.META_GRAPH_VERSION : 'v23.0';
  const response = await fetch('https://graph.facebook.com/' + version + '/me/messages', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: 'RESPONSE', message }),
  });
  if (!response.ok) throw new Error('Messenger Send API trả HTTP ' + response.status);
  return { sent: true };
}

export async function sendTyping(psid: string) {
  if (mock) { console.info('[Messenger mock] typing_on', psid.slice(0, 4) + '***'); return; }
  const state = await db.conversationState.findUnique({ where: { psid } });
  if (!state?.lastInboundAt || Date.now() - state.lastInboundAt.getTime() >= 86_400_000) return;
  if (!env.META_PAGE_ACCESS_TOKEN) throw new Error('META_PAGE_ACCESS_TOKEN chưa cấu hình.');
  const version = /^v\d+\.\d+$/.test(env.META_GRAPH_VERSION || '') ? env.META_GRAPH_VERSION : 'v23.0';
  const response = await fetch(`https://graph.facebook.com/${version}/me/messages`, { method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { Authorization: 'Bearer ' + env.META_PAGE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: psid }, sender_action: 'typing_on' }) });
  if (!response.ok) throw new Error('Messenger typing trả HTTP ' + response.status);
}

