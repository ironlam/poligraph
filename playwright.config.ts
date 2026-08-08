import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Visual Regression Testing
 *
 * Run visual tests:
 *   npm run test:visual           # Run all visual tests
 *   npm run test:visual:update    # Update baseline snapshots
 *   npm run test:visual:report    # Open HTML report
 *   npm run test:visual:ui        # Interactive UI mode
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./tests/visual/test-results",

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use - HTML report with screenshots
  reporter: [
    [
      "html",
      {
        outputFolder: "./tests/visual/playwright-report",
        open: process.env.CI ? "never" : "on-failure",
      },
    ],
    ["list"],
    // JSON report for programmatic access
    ["json", { outputFile: "./tests/visual/test-results/results.json" }],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.BASE_URL || "http://localhost:3000",

    // Collect trace on first retry and for failed tests
    trace: "on-first-retry",

    // Take screenshot on every test for visual review
    screenshot: "on",

    // Record video on first retry (helpful for debugging)
    video: "on-first-retry",
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile viewport
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  // Folder for snapshots
  snapshotDir: "./tests/visual/snapshots",

  // Threshold for visual comparison (0.2 = 20% difference allowed)
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05, // 5% difference allowed
      threshold: 0.2,
    },
  },

  // Run your local dev server before starting the tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Locally 120s is plenty against a warm .next cache. On a CI runner the cache is
    // cold and the first route still has to compile, so the old value made the job fail
    // on its own start-up rather than on anything it was meant to measure.
    timeout: (process.env.CI ? 300 : 120) * 1000,
  },
});
