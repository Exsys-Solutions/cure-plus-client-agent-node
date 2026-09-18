/*
 *
 * Helper: `installBuild`.
 *
 */
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import downloadBuildArchive from "./downloadBuildArchive.mjs";
import extractBuildArchive from "./extractBuildArchive.mjs";
import patchEnvConfig from "./patchEnvConfig.mjs";
import moveDirectory from "./moveDirectory.mjs";
import pathExists from "./pathExists.mjs";
import createLogger from "./createLogger.mjs";

// Downloads a packaged build from a transfer.it link, patches its
// env-config.js for this site, then swaps it into the served build folder -
// backing up whatever was previously live so a bad install can be rolled
// back by hand (see the ".previous" folder left next to servedBuildFolderPath).
// Takes the target site's own config (one machine can serve several sites -
// see config.mjs/sites.json) rather than a single fixed global, and `logger`
// is injected so the poll loop can pass a streaming logger that also pushes
// each line back onto the job's row - see createStreamingLogger.mjs.
const installBuild = async (
  buildUrl,
  { servedBuildFolderPath, envConfigOverrides, previousBuildUploadedAt },
  logger = createLogger("install-build"),
) => {
  const workDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cure-plus-build-"),
  );

  try {
    logger.info(`Downloading build from ${buildUrl}`);
    const archivePath = await downloadBuildArchive(buildUrl, workDir);

    logger.info("Extracting build archive");
    const extractDir = path.join(workDir, "extracted");
    await fs.mkdir(extractDir, { recursive: true });
    await extractBuildArchive(archivePath, extractDir);

    // compressBuildFolder.mjs (cure-plus-git-service-node) archives the
    // "build" directory itself, so the real contents land one level down.
    const newBuildDir = path.join(extractDir, "build");

    if (!(await pathExists(newBuildDir))) {
      throw new Error(
        `Extracted archive has no "build" folder at ${newBuildDir}`,
      );
    }

    const envConfigPath = path.join(newBuildDir, "env-config.js");

    if (!(await pathExists(envConfigPath))) {
      throw new Error(
        `Extracted build has no env-config.js at ${envConfigPath}`,
      );
    }

    logger.info("Patching env-config.js with this site's settings");

    // This is the *previous* build's install date for this site - i.e.
    // this site's ex_client_sites_pkg.lastUpdatedAt as it was just before
    // this install (see pollLoop.mjs, which looks it up via
    // getClientSiteRow before calling installBuild). AppReleaseHistoryModal
    // /ReleaseNotesModal.tsx read this back as the start of the "what's new
    // since your last update" range, so it must be the OLD value, not this
    // install's own timestamp - once this install succeeds,
    // updateSiteActiveBuild overwrites lastUpdatedAt with the new one for
    // next time. Just the date portion (dd-mm-yyyy) is kept, dropping the
    // time-of-day half of the dd-mm-yyyy hh:mm am/pm value.
    await patchEnvConfig(envConfigPath, {
      ...envConfigOverrides,
      REACT_APP_LAST_BUILD_UPLOADED_TO_CLIENT_AT: (previousBuildUploadedAt || "").split(" ")[0],
    });

    const backupPath = `${servedBuildFolderPath}.previous`;

    if (await pathExists(servedBuildFolderPath)) {
      logger.info(`Backing up current build to ${backupPath}`);
      await fs.rm(backupPath, { recursive: true, force: true });
      await moveDirectory(servedBuildFolderPath, backupPath);
    }

    logger.info(`Installing new build to ${servedBuildFolderPath}`);
    await moveDirectory(newBuildDir, servedBuildFolderPath);

    logger.success("Build installed successfully");

    return { status: "success" };
  } catch (error) {
    logger.error(`Install failed: ${error.message}`);
    return { status: "failure", errorMessage: error.message };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
};

export default installBuild;
