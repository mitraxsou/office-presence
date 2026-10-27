import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { FRAME_LIST } from "../../src/frames/fixtures";

const ROOT = path.resolve(__dirname, "../../..");
const FRAMES_DIR = path.join(ROOT, "docs/design/frames");
const DIFF_DIR = path.join(ROOT, "docs/design/qa-diffs");
const MAX_DIFF_RATIO = 0.01;

function isPhone(frame: string) {
  return /_P-/.test(frame) || /^(0[3-9]|1\d|2[0-9])_/.test(frame);
}

test.describe("frame screenshot diffs", () => {
  test.beforeAll(() => {
    fs.mkdirSync(DIFF_DIR, { recursive: true });
  });

  for (const frame of FRAME_LIST) {
    // Foundations and flow diagram are reference sheets, not app screens.
    if (frame.startsWith("01_") || frame.startsWith("02_")) continue;

    test(frame, async ({ page }) => {
      const phone = isPhone(frame);
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1024, height: 768 });
      await page.goto(`/dev-frames/${frame}`, { waitUntil: "networkidle" });
      await page.waitForSelector(`[data-frame="${frame}"]`);
      // Disable animations for stable diffs.
      await page.addStyleTag({
        content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
      });
      const shot = await page.locator(`[data-frame="${frame}"]`).screenshot({ type: "png" });
      const actualPath = path.join(DIFF_DIR, `${frame}.actual.png`);
      fs.writeFileSync(actualPath, shot);

      const expectedPath = path.join(FRAMES_DIR, `${frame}.png`);
      test.skip(!fs.existsSync(expectedPath), `Missing expected frame ${expectedPath}`);

      const expected = PNG.sync.read(fs.readFileSync(expectedPath));
      const actual = PNG.sync.read(shot);

      // Frames may include device chrome; compare at overlapping top-left region.
      const width = Math.min(expected.width, actual.width);
      const height = Math.min(expected.height, actual.height);
      const expCrop = crop(expected, width, height);
      const actCrop = crop(actual, width, height);
      const diff = new PNG({ width, height });
      const mismatched = pixelmatch(expCrop.data, actCrop.data, diff.data, width, height, {
        threshold: 0.12,
        includeAA: false,
      });
      const ratio = mismatched / (width * height);
      fs.writeFileSync(path.join(DIFF_DIR, `${frame}.diff.png`), PNG.sync.write(diff));
      expect(ratio, `${frame} diff ratio ${ratio.toFixed(4)}`).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    });
  }
});

function crop(src: PNG, width: number, height: number) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (src.width * y + x) << 2;
      const di = (width * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}
