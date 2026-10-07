import { defineConfig } from "@playwright/test";
import legacy from "./playwright.config";
export default defineConfig({
  ...legacy,
  testDir: "tests/guest",
  use: { ...legacy.use, baseURL: "http://127.0.0.1:4181" },
  webServer: {
    ...legacy.webServer,
    command: "npm run dev",
    url: "http://127.0.0.1:4181/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "4181",
      APP_ORIGIN: "http://127.0.0.1:4181",
      HRBIP_ACCOUNTS_ENABLED: "false",
      DATA_DIR: ".data/e2e-guest-" + Date.now(),
    },
  },
});
