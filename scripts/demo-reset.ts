import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const project = args.find(value => value.startsWith('--project='))?.split('=')[1];
if (!args.includes('--yes') || !project || !/^long-fish-(?:e2e|restore|demo)[a-z0-9-]*$/.test(project)) {
  console.error('Yêu cầu --yes và --project=<project demo riêng>. Stack long-fish đang chạy không nằm trong phạm vi reset.');
  process.exitCode = 1;
} else {
  const result = spawnSync('docker', ['compose', '-p', project, 'exec', '-T', 'backend', 'node', 'dist/src/demo-reset.js', '--yes'], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
