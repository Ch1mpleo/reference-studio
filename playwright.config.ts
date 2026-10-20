import { defineConfig, devices } from "@playwright/test";

const channel = process.env.REFERENCE_STUDIO_BROWSER_CHANNEL ?? "msedge";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: channel === "msedge" ? "edge" : channel,
      use: {
        ...devices["Desktop Edge"],
        channel,
      },
    },
  ],
});
