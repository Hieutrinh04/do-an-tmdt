import { Prisma } from '@prisma/client';
import { db } from './db';
import { env } from './env';

export function startOutbox() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const pending = await db.outboxEvent.findMany({ where: { sentAt: null }, orderBy: { id: 'asc' }, take: 64 });
      const seen = new Set<Prisma.JsonValue>();
      const now = new Date();
      const event = pending.find(row => {
        const code = (row.payload as Prisma.JsonObject).code ?? row.id;
        if (seen.has(code)) return false;
        seen.add(code);
        return row.availableAt <= now;
      });
      if (!event) return;
      const url = event.kind === 'created' ? env.N8N_ORDER_CREATED_WEBHOOK : env.N8N_ORDER_STATUS_WEBHOOK;
      if (!url) return;
      try {
        const response = await fetch(url, {
          method: 'POST', signal: AbortSignal.timeout(45_000),
          headers: { 'content-type': 'application/json', 'x-webhook-secret': env.N8N_WEBHOOK_SECRET || '' },
          body: JSON.stringify({ ...(event.payload as Prisma.JsonObject), kind: event.kind, eventId: event.id }),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if ((await response.json()).ok !== true) throw new Error('n8n chưa xác nhận xử lý.');
        await db.outboxEvent.update({ where: { id: event.id }, data: { sentAt: new Date() } });
      } catch (error) {
        console.warn('Gửi n8n thất bại, sẽ thử lại', event.id, String(error));
        await db.outboxEvent.update({ where: { id: event.id }, data: {
          attempts: { increment: 1 },
          availableAt: new Date(Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(event.attempts, 9))),
        } });
      }
    } catch (error) { console.error('Lỗi đọc hàng đợi n8n', error); }
    finally { running = false; }
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}


