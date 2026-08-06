import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end tests.
 *
 *   npm run e2e            # run headless
 *   npm run e2e:ui         # run with the interactive UI (great for a first look)
 *
 * Specs live in `e2e/`. Playwright starts the dev server itself (see `webServer`
 * below) and drives a real Chromium against it.
 *
 * IMPORTANT: these tests hit a running app, which for this project means a live
 * Supabase. Do NOT write specs that create real orders or mutate real data
 * against a production database — keep e2e to read-only navigation and rendering
 * unless you are pointed at a throwaway database. State-changing behaviour
 * (availability, RPCs, the panel) is covered by the in-database SQL suite
 * (`npm run db:test`), which rolls back.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
