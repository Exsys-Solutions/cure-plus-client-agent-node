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

// Every Tomcat instance in this setup deploys its one site as the ROOT
// context - never a named sub-context - so a site's build always lives at
// <installDir>\<appBase>\ROOT, matching the real layout confirmed on an
// actual client machine (D:\TomCat9\webapps\ROOT, a second instance's
// D:\TomCat9_test\webapps1\ROOT). That's also where a new build gets
// extracted to - see installBuild.mjs. Requiring env-config.js to already
// exist there is what tells "this instance's site has been deployed at
// least once" apart from a freshly set-up instance nothing's been pushed
// to yet - the latter needs a one-time manual sites.json entry, same as any
// other brand-new site provisioning (see server.xml/port setup).
const ROOT_CONTEXT_FOLDER = "ROOT";

const findDeployedSite = async ({ installDir, port, appBase }, siteUrl, logger) => {
  const servedBuildFolderPath = path.join(installDir, appBase, ROOT_CONTEXT_FOLDER);
  const envConfigPath = path.join(servedBuildFolderPath, "env-config.js");

  if (!(await pathExists(envConfigPath))) {
    logger?.warning(
      `No env-config.js at ${envConfigPath} - skipping (this instance's site may not have been deployed yet)`,
    );
    return null;
  }

  const reactAppOverrides = await readEnvConfigOverrides(envConfigPath);

  // Built from BASE_SITE_URL + this instance's own Connector port rather than
  // trusting whatever was already in env-config.js - the port is the one
  // thing that's actually known for certain from server.xml.
  reactAppOverrides.REACT_APP_BASE_URL = `${siteUrl}:${port}`;
  reactAppOverrides.REACT_APP_API_URL = `${siteUrl}:${port}/ords/`;

  return {
    name: `${appBase}-${port}`,
    servedBuildFolderPath,
    reactAppOverrides,
  };
};

const discoverSites = async (
  installDirs = getTomcatFolderPaths(),
  logger,
) => {
  const siteUrl = getSiteUrl();
  const instances = await findTomcatInstances(installDirs, logger);
  const sites = [];

  for (const instance of instances) {
    const site = await findDeployedSite(instance, siteUrl, logger);
    if (site) sites.push(site);
  }

  return sites;
};

export default discoverSites;
