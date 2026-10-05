import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4180",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4180/api/health",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: "4180",
      APP_ORIGIN: "http://127.0.0.1:4180",
      DATA_DIR: ".data/e2e-" + Date.now(),
    },
  },
});
