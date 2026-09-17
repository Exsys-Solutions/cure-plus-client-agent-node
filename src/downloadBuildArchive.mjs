/*
 *
 * Helper: `downloadBuildArchive`.
 *
 */
import path from "node:path";
import { chromium } from "playwright";

// Verified against a real transferUrl: the share page keeps several
// differently-classed "download" buttons in the DOM at once for its various
// states (single vs. multi-file, etc.) and only makes one of them visible -
// confusingly, the visible one for a single-file transfer is `.js-download`
// ("Download all"), NOT `.js-download-all` (which stays hidden). Selecting
// by `:visible` rather than by button text avoids depending on exact
// wording, which could differ for a multi-file transfer.
const downloadBuildArchive = async (transferUrl, destDir) => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(transferUrl, { waitUntil: "networkidle" });

    const downloadPromise = page.waitForEvent("download", {
      timeout: 1000 * 60 * 5,
    });

    await page.locator(".js-download:visible").first().click();

    const download = await downloadPromise;
    const archivePath = path.join(destDir, "build.zip");
    await download.saveAs(archivePath);

    return archivePath;
  } finally {
    await browser.close().catch(() => {});
  }
};

export default downloadBuildArchive;
