/*
 *
 * Helper: `discoverSites`.
 *
 */
import fs from "node:fs/promises";
import path from "node:path";
import parseServerXml from "./parseServerXml.mjs";
import readEnvConfigOverrides from "./readEnvConfigOverrides.mjs";
import pathExists from "./pathExists.mjs";

// Each entry in TOMCAT_FOLDER_PATH (.env, comma-separated) is a direct
// Tomcat install root - not a drive/folder to scan. A human sets this
// explicitly per machine instead of discovery guessing at it, since it's
// both faster and avoids matching something unrelated that happens to have
// a conf\server.xml.
const getTomcatFolderPaths = () => {
  const raw = process.env.TOMCAT_FOLDER_PATH;

  if (!raw?.trim()) {
    throw new Error(
      "TOMCAT_FOLDER_PATH is not set - copy .env.example to .env and list this machine's Tomcat instance folder(s), comma-separated.",
    );
  }

  return raw
    .split(",")
    .map((installDir) => installDir.trim())
    .filter(Boolean);
};

// Scheme + host, no port - each site's own Connector port gets appended per
// instance below to build its REACT_APP_BASE_URL/REACT_APP_API_URL.
const getSiteUrl = () => {
  const raw = process.env.BASE_SITE_URL;

  if (!raw?.trim()) {
    throw new Error(
      "BASE_SITE_URL is not set - copy .env.example to .env and set this machine's base URL (scheme + host, no port).",
    );
  }

  return raw.trim().replace(/\/+$/, "");
};

const findTomcatInstances = async (installDirs, logger) => {
  const instances = [];

  for (const installDir of installDirs) {
    const serverXmlPath = path.join(installDir, "conf", "server.xml");

    if (!(await pathExists(serverXmlPath))) {
      logger?.warning(
        `TOMCAT_FOLDER_PATH entry "${installDir}" has no conf\\server.xml - skipping`,
      );
      continue;
    }

    const content = await fs.readFile(serverXmlPath, "utf8");
    const parsed = parseServerXml(content);

    if (!parsed) {
      logger?.warning(
        `Could not find a Connector port / Host appBase in ${serverXmlPath} - skipping`,
      );
      continue;
    }

    instances.push({ installDir, port: parsed.port, appBase: parsed.appBase });
  }

  return instances;
};

// A deployed site is any folder directly under a Tomcat instance's appBase
// that has an env-config.js - that's the signal it's an actual deployed
// cureplus build, not Tomcat's own sample/manager webapps or an empty
// context folder. `name` matches the appBase-port convention (e.g.
// "webapps-9090"), with the context folder name appended when it isn't the
// default ROOT context, so multiple non-root contexts on the same instance
// stay distinguishable.
const findDeployedSites = async ({ installDir, port, appBase }, siteUrl) => {
  const appBaseDir = path.join(installDir, appBase);
  let entries;

  try {
    entries = await fs.readdir(appBaseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const sites = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const servedBuildFolderPath = path.join(appBaseDir, entry.name);
    const envConfigPath = path.join(servedBuildFolderPath, "env-config.js");

    if (!(await pathExists(envConfigPath))) continue;

    const reactAppOverrides = await readEnvConfigOverrides(envConfigPath);

    // Built from BASE_SITE_URL + this instance's own Connector port rather than
    // trusting whatever was already in env-config.js - the port is the one
    // thing that's actually known for certain from server.xml.
    reactAppOverrides.REACT_APP_BASE_URL = `${siteUrl}:${port}`;
    reactAppOverrides.REACT_APP_API_URL = `${siteUrl}:${port}/ords/`;

    const name =
      entry.name.toUpperCase() === "ROOT"
        ? `${appBase}-${port}`
        : `${appBase}-${port}-${entry.name}`;

    sites.push({ name, servedBuildFolderPath, reactAppOverrides });
  }

  return sites;
};

const discoverSites = async (
  installDirs = getTomcatFolderPaths(),
  logger,
) => {
  const siteUrl = getSiteUrl();
  const instances = await findTomcatInstances(installDirs, logger);
  const allSites = [];

  for (const instance of instances) {
    allSites.push(...(await findDeployedSites(instance, siteUrl)));
  }

  return allSites;
};

export default discoverSites;
