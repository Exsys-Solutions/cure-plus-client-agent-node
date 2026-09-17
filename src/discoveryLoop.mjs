/*
 *
 * `discoveryLoop`: re-runs site discovery every 20 minutes, so sites.json
 * and the central registry stay in sync as sites get added/removed on this
 * machine over time. The initial run happens explicitly in index.mjs before
 * this loop starts, so this loop's own first tick is 20 minutes after that
 * - not an immediate duplicate of it.
 *
 */
import runDiscovery from "./runDiscovery.mjs";
import { DISCOVERY_INTERVAL_MS } from "./constants.mjs";
import createLogger from "./createLogger.mjs";

const logger = createLogger("discovery-loop");

const startDiscoveryLoop = async () => {
  logger.info(
    `Starting discovery loop (every ${DISCOVERY_INTERVAL_MS / 60_000} min)`,
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, DISCOVERY_INTERVAL_MS));

    try {
      await runDiscovery(logger);
    } catch (error) {
      logger.error(`Discovery cycle failed: ${error.message}`);
    }
  }
};

export default startDiscoveryLoop;
