/*
 *
 * `discover`: one-off CLI for runDiscovery.mjs - scans this machine,
 * writes/refreshes sites.json, and registers discovered sites with exsys.
 * The agent also runs this automatically at startup and every 20 minutes
 * afterward (see index.mjs/discoveryLoop.mjs); use this directly when
 * setting up a brand-new machine for the first time, or to force an
 * immediate refresh without waiting for the next cycle. Reads CLIENT_ID and
 * TOMCAT_FOLDER_PATH from .env - copy .env.example to .env and fill it in
 * for this machine before the first run:
 *
 *   node src/discover.mjs
 *
 */
import "./loadEnv.mjs";
import runDiscovery from "./runDiscovery.mjs";
import createLogger from "./createLogger.mjs";

const logger = createLogger("discover");

try {
  await runDiscovery(logger);
} catch (error) {
  logger.error(error.message);
  process.exit(1);
}
