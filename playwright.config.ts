import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:8080';
if (process.env.E2E_WRITE === '1') {
  const project = process.env.E2E_COMPOSE_PROJECT;
  if (!project?.startsWith('long-fish-e2e')) throw new Error('Write tests require an isolated E2E project.');
  const compose = (args: string[]) => execFileSync('docker', ['compose', '-p', project, ...args], { encoding: 'utf8' }).trim();
  const url = new URL(baseURL);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port === '8080' || compose(['port', 'frontend', '80']).split(':').at(-1) !== url.port) {
    throw new Error('E2E_BASE_URL must point to the isolated frontend.');
  }
  const mode = compose(['exec', '-T', 'backend', 'node', '-e', 'console.log(process.env.MOCK_INTEGRATIONS)']);
  if (mode !== 'true') throw new Error('Write tests require MOCK_INTEGRATIONS=true.');
}

export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 60_000,
  outputDir: 'data/playwright',
  reporter: [['list'], ['json', { outputFile: 'data/playwright-results.json' }]],
  use: { baseURL, trace: 'retain-on-failure', actionTimeout: 10_000, navigationTimeout: 25_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 800 } } },
    { name: 'mobile', use: devices['Pixel 7'] },
  ],
});
