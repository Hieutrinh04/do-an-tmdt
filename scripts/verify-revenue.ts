import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const project = process.env.E2E_COMPOSE_PROJECT || 'long-fish-e2e';
if (!project.startsWith('long-fish-e2e')) throw new Error('Use an isolated E2E project.');
const compose = (args: string[]) => execFileSync('docker', ['compose', '-p', project, ...args], { encoding: 'utf8' }).trim();
const backend = (script: string) => compose(['exec', '-T', 'backend', 'node', '-e', script]);
const orders = JSON.parse(backend("const {db}=require('./dist/src/db.js');db.order.findMany({select:{createdAt:true,status:true,total:true}}).then(x=>console.log(JSON.stringify(x))).finally(()=>db.$disconnect())")) as { createdAt: string; status: string; total: number }[];
const timezone = compose(['exec', '-T', 'n8n', 'printenv', 'GENERIC_TIMEZONE', 'TZ']);
assert.deepEqual(timezone.split(/\r?\n/), ['Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh']);
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const lastMonth = new Date(Date.parse(today.slice(0, 7) + '-01') - 86_400_000).toISOString().slice(0, 7);
const results = [['Daily_Revenue', today], ['Monthly_Revenue', lastMonth]].map(([table, period]) => {
  const csv = backend(`process.stdout.write(require('node:fs').readFileSync('/data/mock/${table}.csv','utf8'))`);
  assert.equal(csv.split(/\r?\n/)[0], 'period,orders,revenue,cancelled');
  const matched = orders.filter(order => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(order.createdAt)).startsWith(period));
  const expected = { period, orders: matched.length, revenue: matched.filter(order => order.status === 'DELIVERED').reduce((sum, order) => sum + order.total, 0),
    cancelled: matched.filter(order => order.status === 'CANCELLED').length };
  assert.ok(csv.split(/\r?\n/).includes(`"${period}",${expected.orders},${expected.revenue},${expected.cancelled}`), table);
  return { table, ...expected };
});
writeFileSync('docs/revenue-verification.json', JSON.stringify({ timezone: 'Asia/Ho_Chi_Minh', results }, null, 2) + '\n');
console.table(results);
