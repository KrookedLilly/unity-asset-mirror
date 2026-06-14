import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173', ...devices['Pixel 5'] },
  webServer: [
    {
      // Run backend in fixture mode from server/ dir using its own tsx
      command: 'ASSET_FIXTURE=./tests/fixtures/detail-341308.html COVEO_FIXTURE_DIR=./tests/fixtures REVIEWS_FIXTURE=./tests/fixtures/reviews-341308.html PORT=8787 node_modules/.bin/tsx src/server.ts',
      cwd: '../server',
      url: 'http://localhost:8787/api/asset/341308',
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
    {
      command: 'npm run dev',
      cwd: '.',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
  ],
});
