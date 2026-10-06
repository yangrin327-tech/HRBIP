import { defineConfig } from "@playwright/test";
import legacy from "./playwright.config";
export default defineConfig({
  ...legacy,
  testDir: "tests/guest",
  webServer: {
    ...legacy.webServer,
    command: "npm run dev",
    url: "http://127.0.0.1:4180/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "4180",
      APP_ORIGIN: "http://127.0.0.1:4180",
      HRBIP_ACCOUNTS_ENABLED: "false",
    },
  },
});
