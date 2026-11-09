import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();
process.env.DATABASE_URL ??= 'file:./long-fish.db';

export const env = process.env;
export const mock = env.MOCK_INTEGRATIONS !== 'false';
export const zone = 'Asia/Ho_Chi_Minh';
export const dayKey = (date: Date) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
export const dayStart = (day: string) => new Date(day + 'T00:00:00+07:00');
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

