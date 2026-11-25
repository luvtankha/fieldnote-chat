import { defineConfig, devices } from '@playwright/test';

const web = 'http://127.0.0.1:3400';
const api = 'http://127.0.0.1:4400';

export default defineConfig({
  testDir: 'tests',
  timeout: 45000,
  workers: 2,
  forbidOnly: !!process.env.CI,
  use: { baseURL: web, colorScheme: 'light', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'], defaultBrowserType: 'webkit' } }
  ],
  webServer: [
    { command: 'node scripts/test-server.mjs', url: `${api}/api/health`, timeout: 120000, env: { AI_BASE_URL: '', OPENAI_API_KEY: '' } },
    { command: 'npm run dev -w frontend -- --port 3400', url: web, timeout: 120000, env: { BACKEND_URL: api, NEXT_PUBLIC_SOCKET_URL: api } }
  ]
});
