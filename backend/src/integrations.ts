import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Router } from 'express';
import { env, mock } from './env';
import { botInput, handleMessage } from './bot';
import { HttpError, psid } from './domain';
import { sendMessenger } from './messenger';

import { sheetColumns as columns } from './sheet-columns';
import { csvField as field } from './csv';

let csvQueue: Promise<unknown> = Promise.resolve();


async function writeCsv(sheet: keyof typeof columns, row: Record<string, string | number>) {
  const directory = resolve(env.MOCK_DATA_DIR || '../data');
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, sheet + '.csv');
  const headers = columns[sheet];
  let lines: string[];
  try { lines = (await readFile(file, 'utf8')).trimEnd().split('\n'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    lines = [headers.join(',')];
  }
  const key = field(row[headers[0]] ?? '') + ',';
  const value = headers.map(name => field(row[name] ?? '')).join(',');
  const index = lines.findIndex(line => line.startsWith(key));
  if (index > 0) lines[index] = value;
  else lines.push(value);
  await writeFile(file + '.tmp', lines.join('\n') + '\n', 'utf8');
  await rename(file + '.tmp', file);
}

export const integrations = Router();

integrations.post('/bot/message', async (req, res) => {
  res.json(await handleMessage(botInput.parse(req.body)));
});
integrations.post('/messenger/send', async (req, res) => {
  const input = z.object({ psid, message: z.record(z.string(), z.unknown()) }).parse(req.body);
  const result = await sendMessenger(input.psid, input.message);
  res.json({ ok: true, ...result });
});
integrations.post('/mock/sheets', async (req, res) => {
  if (!mock) throw new HttpError(404, 'Chế độ mock đã tắt.');
  const { sheet, row } = z.object({
    sheet: z.enum(['Long_Fish_Orders', 'Daily_Revenue', 'Monthly_Revenue']),
    row: z.record(z.string(), z.union([z.string(), z.number()])),
  }).parse(req.body);
  const work = csvQueue.then(() => writeCsv(sheet, row));
  csvQueue = work.catch(() => {});
  await work;
  console.info('[Sheets mock]', sheet, row.code || row.period);
  res.json({ ok: true });
});
integrations.post('/mock/email', (req, res) => {
  if (!mock) throw new HttpError(404, 'Chế độ mock đã tắt.');
  const { subject, html, to } = z.object({ subject: z.string().max(250), html: z.string().max(100000), to: z.string().email().max(254).optional() }).parse(req.body);
  const masked = to ? to.replace(/^(.{2}).*(@.*)$/, '$1***$2') : 'người bán';
  console.info('[Email mock]', '→ ' + masked, subject, 'HTML đã dựng, ' + html.length + ' ký tự');
  res.json({ ok: true });
});

