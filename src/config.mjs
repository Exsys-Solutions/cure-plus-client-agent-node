/*
 *
 * Config: loads and validates this machine's sites.json before anything runs.
 *
 * One `clientId` per machine, matching one row in the central clients
 * registry - a deploy job targets the machine, and installing means pushing
 * the same build to every site listed here (production plus however many
 * test sites also live on this box). Any REACT_APP_* key set at the top
 * level is a machine-wide default; a site's own `reactAppOverrides` wins
 * wherever it repeats a key, so only what actually differs per site needs
 * stating there. REACT_APP_ACTIVE_CLIENT is the one exception - it's never
 * read from config, always computed as `${clientId}-${site.name}` below, so
 * it's guaranteed unique per site without anyone having to set or keep it
 * in sync by hand.
 *
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const SITES_CONFIG_PATH =
  process.env.SITES_CONFIG_PATH || path.resolve("sites.json");

const REQUIRED_OVERRIDE_KEYS = [
  "REACT_APP_BASE_URL",
  "REACT_APP_API_URL",
  "REACT_APP_EXSYS_NPHIES_WEB_SERVER_URL",
];

// Deliberately a function, not pre-computed module-level constants: it's
// called fresh every time (each poll tick, see pollLoop.mjs), not cached,
// so the periodic re-discovery loop updating sites.json on disk (see
// discoveryLoop.mjs) is picked up on the very next read - no restart, no
// shared in-memory state to keep in sync between the two loops. It also
// must not throw merely on import - on a brand-new machine sites.json
// doesn't exist yet until the initial discovery run creates it (see
// index.mjs), so validation only happens when this is actually called.
export const loadConfig = () => {
  let raw;

  try {
    raw = readFileSync(SITES_CONFIG_PATH, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read sites config at ${SITES_CONFIG_PATH} - copy sites.example.json to sites.json and fill it in for this machine: ${error.message}`,
    );
  }

  const { clientId, sites, ...machineDefaults } = JSON.parse(raw);

  if (!clientId?.trim()) {
    throw new Error(`${SITES_CONFIG_PATH} is missing "clientId"`);
  }

  if (!Array.isArray(sites) || sites.length === 0) {
    throw new Error(`${SITES_CONFIG_PATH} must have a non-empty "sites" array`);
  }

  const resolvedSites = sites.map((site, index) => {
    const label = site.name || site.servedBuildFolderPath || `#${index}`;

    if (!site.name?.trim()) {
      throw new Error(`sites[${index}] is missing "name"`);
    }

    if (!site.servedBuildFolderPath?.trim()) {
      throw new Error(`Site "${label}" is missing "servedBuildFolderPath"`);
    }

    const envConfigOverrides = {
      ...machineDefaults,
      ...site.reactAppOverrides,
      REACT_APP_ACTIVE_CLIENT: `${clientId}-${site.name}`,
    };

    const missing = REQUIRED_OVERRIDE_KEYS.filter(
      (key) => !envConfigOverrides[key]?.trim?.(),
    );

    if (missing.length > 0) {
      throw new Error(
        `Site "${label}" is missing (after machine-level defaults): ${missing.join(", ")}`,
      );
    }

    return {
      name: site.name,
      servedBuildFolderPath: site.servedBuildFolderPath,
      envConfigOverrides,
    };
  });

  const names = resolvedSites.map((site) => site.name);
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicateNames.length > 0) {
    throw new Error(
      `sites.json has duplicate site name(s): ${[...new Set(duplicateNames)].join(", ")}`,
    );
  }

  return { clientId, sites: resolvedSites };
};
