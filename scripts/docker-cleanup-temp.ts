import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const docker = (args: string[], env = process.env) => execFileSync('docker', args, { encoding: 'utf8', env }).trim();
const allowed = (name: string) => /^long-fish-(?:e2e(?:-[a-z0-9]+)*|restore-\d{14})$/.test(name);
const lines = (value: string) => value ? value.split(/\r?\n/).map(row => { const [name, project] = row.split('|'); return { name, project }; }) : [];
const containers = lines(docker(['ps', '-a', '--format', '{{.Names}}|{{.Label "com.docker.compose.project"}}']));
const volumes = lines(docker(['volume', 'ls', '--format', '{{.Name}}|{{.Label "com.docker.compose.project"}}']));
const networks = lines(docker(['network', 'ls', '--format', '{{.Name}}|{{.Label "com.docker.compose.project"}}']));
const projects = [...new Set([...containers, ...volumes, ...networks].map(row => row.project).filter(allowed))].sort();
const requested = process.argv.find(arg => arg.startsWith('--project='))?.slice(10);
if (requested && !allowed(requested)) throw new Error('Project không nằm trong danh sách tiền tố tạm được phép.');
const targets = requested ? projects.filter(project => project === requested) : projects;
const inventory = targets.map(project => ({ project, containers: containers.filter(r => r.project === project).map(r => r.name),
  volumes: volumes.filter(r => r.project === project).map(r => r.name), networks: networks.filter(r => r.project === project).map(r => r.name) }));
console.log(JSON.stringify({ mode: process.argv.includes('--yes') ? 'DELETE AFTER BACKUP' : 'DRY RUN', inventory }, null, 2));
if (!process.argv.includes('--yes') || !targets.length) process.exit(0);
const primary = () => docker(['compose', '-p', 'long-fish', 'exec', '-T', 'backend', 'node', '-e',
  "const{db}=require('./dist/src/db.js');Promise.all([db.order.count(),db.product.count()]).then(x=>console.log(JSON.stringify(x))).finally(()=>db.$disconnect())"]);
const before = primary();
const artifact = resolve('data/cleanup-' + new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(artifact, { recursive: true });
writeFileSync(resolve(artifact, 'inventory.json'), JSON.stringify(inventory, null, 2));
for (const item of inventory) {
  // Stop only inventoried temporary containers so SQLite and PostgreSQL archives are consistent.
  if (item.containers.length) docker(['stop', ...item.containers]);
  for (const volume of item.volumes) {
    assert.ok(volume.startsWith(item.project + '_'));
    const label = docker(['volume', 'inspect', volume, '--format', '{{index .Labels "com.docker.compose.project"}}']);
    assert.equal(label, item.project);
    docker(['run', '--rm', '--network', 'none', '--mount', `type=volume,src=${volume},dst=/source,readonly`,
      '--mount', `type=bind,src=${artifact},dst=/backup`, '--entrypoint', 'tar', 'long-fish-backend:latest', '-C', '/source', '-cf', '/backup/' + volume + '.tar', '.']);
  }
  docker(['compose', '-p', item.project, '-f', 'docker-compose.yml', '-f', 'docker-compose.postgres.yml', '--profile', 'postgres', 'down', '-v', '--remove-orphans'],
    { ...process.env, POSTGRES_PASSWORD: 'unused-cleanup-only', POSTGRES_DATABASE_URL: 'postgresql://unused:unused@postgres/unused' });
}
assert.equal(primary(), before, 'Số đơn/sản phẩm stack chính đã thay đổi.');
const health = docker(['ps', '--filter', 'label=com.docker.compose.project=long-fish', '--format', '{{.Names}}|{{.Status}}']);
assert.ok(health.includes('long-fish-backend-1|') && health.includes('healthy') && health.includes('long-fish-n8n-1|'));
writeFileSync('docs/cleanup-results.json', JSON.stringify({ at: new Date().toISOString(), projects: targets, backedUpVolumes: inventory.flatMap(r => r.volumes).length,
  primaryCountsBefore: JSON.parse(before), primaryCountsAfter: JSON.parse(primary()), primaryHealth: health.split(/\r?\n/), backup: artifact }, null, 2) + '\n');
console.log('Đã backup/gỡ project tạm; stack long-fish giữ nguyên số đơn/sản phẩm.');
