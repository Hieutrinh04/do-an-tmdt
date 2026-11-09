import { afterEach, expect, test, vi } from 'vitest';

const db = vi.hoisted(() => ({ conversationState: { findUnique: vi.fn() }, handoffRequest: { findFirst: vi.fn(), create: vi.fn() } }));
vi.mock('../src/db', () => ({ db }));
vi.mock('../src/env', () => ({ mock: false, env: { META_PAGE_ACCESS_TOKEN: 'test-token', META_GRAPH_VERSION: 'v23.0' } }));
import { sendMessenger, sendTyping } from '../src/messenger';

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

test('typing_on gửi sender_action trong cửa sổ và không gửi ngoài 24 giờ', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetcher);
  db.conversationState.findUnique.mockResolvedValue({ lastInboundAt: new Date() });
  await sendTyping('1234');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ recipient: { id: '1234' }, sender_action: 'typing_on' });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty('message');
  fetcher.mockClear(); db.conversationState.findUnique.mockResolvedValue({ lastInboundAt: new Date(Date.now() - 25*3600000) });
  await sendTyping('1234'); expect(fetcher).not.toHaveBeenCalled();
});

test('thông báo ngoài 24 giờ chuyển admin, không gọi Meta', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  db.conversationState.findUnique.mockResolvedValue({ lastInboundAt: new Date(Date.now() - 25 * 3600000) });
  db.handoffRequest.findFirst.mockResolvedValue(null);
  const result = await sendMessenger('1234', { text: 'Đơn DH20261109-0001 đang giao.' });
  expect(result).toMatchObject({ sent: false, fallback: 'admin', reason: 'outside_24h' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(db.handoffRequest.create).toHaveBeenCalledOnce();
});

test('trả lời trong 24 giờ dùng RESPONSE và Bearer token', async () => {
  db.conversationState.findUnique.mockResolvedValue({ lastInboundAt: new Date() });
  const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetcher);
  expect(await sendMessenger('1234', { text: 'Chào bạn' })).toEqual({ sent: true });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ messaging_type: 'RESPONSE', recipient: { id: '1234' } });
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
});
