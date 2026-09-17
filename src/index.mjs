/*
 *
 * Entry point - meant to be run as a persistent background service on this
 * client machine. Runs site discovery once up front (so a brand-new
 * machine can bootstrap sites.json from nothing but a CLIENT_ID, and an
 * existing one gets refreshed before polling starts), then runs the job
 * poll loop and the periodic 20-minute re-discovery loop concurrently.
 *
 * For a one-off manual install against a specific build without polling,
 * use `node src/installOnce.mjs <transferUrl>` instead.
 *
 */
import "./loadEnv.mjs";
import runDiscovery from "./runDiscovery.mjs";
import startPollLoop from "./pollLoop.mjs";
import startDiscoveryLoop from "./discoveryLoop.mjs";
import createLogger from "./createLogger.mjs";

const logger = createLogger("agent");

try {
  await runDiscovery(logger);
} catch (error) {
  // Don't refuse to start just because this one run failed (e.g. exsys
  // unreachable) - if sites.json already exists from an earlier successful
  // run, the poll loop can still work off it; if it doesn't exist at all,
  // the poll loop's own per-tick error handling will keep reporting that
  // clearly instead of the whole agent silently not running.
  logger.error(`Initial discovery failed: ${error.message}`);
}

await Promise.all([startPollLoop(), startDiscoveryLoop()]);
