const { spawnSync } = require('node:child_process');

const commands = [
  ['lint', 'npm run lint'], ['build', 'npm run build'], ['test', 'npm test'],
  ['audit prod', 'npm audit --workspaces --include-workspace-root --omit=dev --audit-level=high'],
  ['Playwright', 'npm run test:ui'], ['integrations', 'npm run check:integrations'],
];
const results = commands.map(([step, command]) => {
  const result = spawnSync(command, { shell: true, stdio: 'inherit' });
  const passed = result.status === 0 && (step !== 'Playwright' || process.env.E2E_WRITE === '1');
  return { step, result: passed ? 'PASS' : 'FAIL', note: step === 'Playwright' && !passed && !process.env.E2E_WRITE ? 'Set isolated E2E environment for write tests.' : '' };
});
console.table(results);
require('node:fs').mkdirSync('data', { recursive: true });
require('node:fs').writeFileSync('data/verify-all.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n');
if (results.some(row => row.result === 'FAIL')) process.exitCode = 1;
