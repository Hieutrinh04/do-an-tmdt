import { readFile, writeFile, rename } from 'node:fs/promises';
const file = 'scripts/images/.rate-limits.json';
let deadlines: Record<string, number> | undefined;
async function state() {
  if (!deadlines) {
    try { deadlines = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      deadlines = {};
    }
  }
  return deadlines!;
}

export async function assertNotCoolingDown(host: string) {
  const until = (await state())[host];
  if (until && Date.now() < until) throw new Error(host + ' yêu cầu chờ tới ' + new Date(until).toISOString());
}

export async function coolDown(host: string, seconds: number) {
  const data = await state();
  data[host] = Math.max(data[host] || 0, Date.now() + seconds * 1000);
  await writeFile(file + '.tmp', JSON.stringify(data));
  await rename(file + '.tmp', file);
}

