import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/frames",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../docs/design/qa-diffs/report" }]],
  use: {
    baseURL: process.env.FRAME_BASE_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1024, height: 768 },
  },
  webServer: process.env.FRAME_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 3000",
        url: "http://127.0.0.1:3000/dev-frames/30_W-Login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
