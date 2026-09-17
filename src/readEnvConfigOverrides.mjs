/*
 *
 * Helper: `readEnvConfigOverrides`.
 *
 */
import { readFile } from "node:fs/promises";

// Inverse of patchEnvConfig.mjs - reads a site's already-live env-config.js
// back out, so discoverSites.mjs can seed a new sites.json entry from
// whatever that site is already actually configured with, instead of
// requiring someone to retype every URL by hand. REACT_APP_ACTIVE_CLIENT,
// REACT_APP_BASE_URL and REACT_APP_API_URL are deliberately not captured
// here - discoverSites.mjs always computes them fresh (ACTIVE_CLIENT as
// `${clientId}-${site.name}`, the URLs as BASE_SITE_URL + this instance's own
// Connector port), so reading back whatever value happened to be live
// would just be discarded anyway.
const OVERRIDE_KEYS = [
  "REACT_APP_EXSYS_NPHIES_WEB_SERVER_URL",
  "REACT_APP_EXSYS_NPHIES_WEB_SERVER_API_KEY",
];

const readEnvConfigOverrides = async (envConfigPath) => {
  const content = await readFile(envConfigPath, "utf8");

  const overrides = {};

  for (const key of OVERRIDE_KEYS) {
    const match = content.match(new RegExp(`\\b${key}\\s*:\\s*"([^"]*)"`));
    if (match) {
      overrides[key] = match[1];
    }
  }

  return overrides;
};

export default readEnvConfigOverrides;
