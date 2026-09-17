/*
 *
 * `runDiscovery`: scans this machine for Tomcat instances and their
 * deployed sites, refreshes sites.json from what it finds, and registers
 * the discovered sites with exsys so the admin "install build" picker can
 * list them. Shared by the one-off `discover` CLI and discoveryLoop.mjs's
 * periodic re-run, so both stay in sync with the same logic.
 *
 */
import fs from "node:fs";
import path from "node:path";
import discoverSites from "./discoverSites.mjs";
import { registerSitesWithExsys } from "./clientSitesRegistry.mjs";

const SITES_CONFIG_PATH =
  process.env.SITES_CONFIG_PATH || path.resolve("sites.json");

const runDiscovery = async (logger) => {
  const existing = fs.existsSync(SITES_CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(SITES_CONFIG_PATH, "utf8"))
    : null;

  const clientId = existing?.clientId || process.env.CLIENT_ID;

  if (!clientId) {
    throw new Error(
      "No clientId available - set CLIENT_ID for a first-time run on this machine (CLIENT_ID=exsys136 node src/discover.mjs), or make sure sites.json already has one.",
    );
  }

  logger.info("Scanning for Tomcat instances and deployed sites...");
  const discovered = await discoverSites(undefined, logger);

  if (discovered.length === 0) {
    // Don't wipe out a perfectly good existing sites.json over a transient
    // hiccup (a Tomcat instance mid-restart, a drive briefly unavailable) -
    // just skip this cycle's write and try again next time.
    logger.warning(
      "No deployed sites found - leaving sites.json as-is for this cycle.",
    );
    return;
  }

  logger.info(
    `Found ${discovered.length} site(s): ${discovered.map((site) => site.name).join(", ")}`,
  );

  // Machine-level REACT_APP_* defaults (see config.mjs) aren't
  // discoverable - carried over from the existing sites.json if there is
  // one, otherwise left empty for a human to fill in.
  const machineDefaults = existing
    ? Object.fromEntries(
        Object.entries(existing).filter(
          ([key]) => key !== "clientId" && key !== "sites",
        ),
      )
    : {};

  fs.writeFileSync(
    SITES_CONFIG_PATH,
    JSON.stringify(
      { clientId, ...machineDefaults, sites: discovered },
      null,
      2,
    ),
  );

  logger.success(`Wrote ${SITES_CONFIG_PATH}`);

  // The local write above is what the agent itself actually depends on -
  // registering centrally is only so the admin picker can list this
  // machine's sites, and a failure there (e.g. the exsys table not existing
  // yet) shouldn't be reported as this whole run having failed.
  try {
    await registerSitesWithExsys(clientId, discovered);
    logger.success("Registered discovered sites with exsys");
  } catch (error) {
    logger.warning(`Could not register sites with exsys: ${error.message}`);
  }
};

export default runDiscovery;
