const { spawnSync } = require('node:child_process');
const { mkdirSync, readFileSync } = require('node:fs');
const { chromium } = require('playwright');

mkdirSync('docs/lighthouse', { recursive: true });
const base = process.env.LIGHTHOUSE_URL || 'http://localhost:8080';
const scores = [];
for (const [name, path] of [['home', '/'], ['product', '/product/neon-tetra']]) {
  const output = 'docs/lighthouse/' + name;
  const result = spawnSync(process.execPath, [require.resolve('lighthouse/cli/index.js'), base + path,
    '--chrome-path=' + chromium.executablePath(), '--chrome-flags=--headless --no-first-run', '--output=json', '--output=html',
    '--output-path=' + output, '--quiet'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const { categories, runtimeError } = JSON.parse(readFileSync(output + '.report.json', 'utf8'));
  if (runtimeError) throw new Error(runtimeError.message);
  scores.push({ page: name, ...Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, Math.round(value.score * 100)])) });
}
console.table(scores);
if (scores.some(({ page, ...row }) => Object.values(row).some(score => score < 85))) process.exitCode = 1;
