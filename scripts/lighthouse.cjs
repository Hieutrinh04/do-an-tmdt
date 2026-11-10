// Đo Lighthouse (cùng engine với PageSpeed Insights) cho điện thoại và máy tính, kèm các chỉ số Core Web Vitals theo hướng dẫn đồ án:
// điểm Mobile ≥ 60, Desktop ≥ 80, LCP ≤ 2,5 s, CLS ≤ 0,1, TTFB ≤ 800 ms. Chạy: npm run lighthouse
const { spawnSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');

mkdirSync('docs/lighthouse', { recursive: true });
const base = process.env.LIGHTHOUSE_URL || 'http://localhost:8080';
const pages = [['home', '/'], ['category', '/danh-muc/betta'], ['product', '/san-pham/neon-tetra']];
const rows = [];
for (const form of ['mobile', 'desktop']) {
  for (const [name, path] of pages) {
    const output = 'docs/lighthouse/' + name + (form === 'mobile' ? '' : '-desktop');
    const args = [require.resolve('lighthouse/cli/index.js'), base + path, '--chrome-path=' + chromium.executablePath(),
      '--chrome-flags=--headless --no-first-run', '--output=json', '--output=html', '--output-path=' + output, '--quiet'];
    if (form === 'desktop') args.push('--preset=desktop');
    let report;
    for (let attempt = 1; attempt <= 3 && !report; attempt++) {
      const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
      if (result.status !== 0) continue;
      const parsed = JSON.parse(readFileSync(output + '.report.json', 'utf8'));
      if (!parsed.runtimeError) report = parsed;
    }
    if (!report) { console.error('Không đo được ' + form + ' ' + path); process.exit(1); }
    const score = key => Math.round(report.categories[key].score * 100);
    const audit = id => report.audits[id].numericValue;
    rows.push({
      form, page: name, performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo'),
      lcpSeconds: +(audit('largest-contentful-paint') / 1000).toFixed(2), cls: +audit('cumulative-layout-shift').toFixed(3),
      tbtMs: Math.round(audit('total-blocking-time')), ttfbMs: Math.round(audit('server-response-time')),
    });
  }
}
console.table(rows);
writeFileSync('docs/lighthouse/scores.json', JSON.stringify({ at: new Date().toISOString(), base, rows }, null, 2));
const bad = rows.filter(row => row.performance < (row.form === 'mobile' ? 60 : 80) || row.seo < 90 || row.accessibility < 90 || row.bestPractices < 90 || row.cls > 0.1 || row.ttfbMs > 800);
for (const row of bad) console.log('Chưa đạt ngưỡng: ' + row.form + ' ' + row.page);
const slowLcp = rows.filter(row => row.lcpSeconds > 2.5).map(row => row.form + ' ' + row.page + ' (' + row.lcpSeconds + ' s)');
if (slowLcp.length) console.log('LCP > 2,5 s (mô phỏng mạng chậm): ' + slowLcp.join(', '));
process.exitCode = bad.length ? 1 : 0;
