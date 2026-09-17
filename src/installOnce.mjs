/*
 *
 * Manual trigger for testing the install pipeline directly against a real
 * transferUrl, without going through the poll loop:
 *   node src/installOnce.mjs <transferUrl>              - installs to every site
 *   node src/installOnce.mjs <transferUrl> <siteName>   - installs to one
 *                                                          site only, by its
 *                                                          sites.json "name"
 *
 */
import "./loadEnv.mjs";
import { loadConfig } from "./config.mjs";
import installBuild from "./installBuild.mjs";

const [, , buildUrl, siteNameArg] = process.argv;

if (!buildUrl) {
  console.error("Usage: node src/installOnce.mjs <transferUrl> [siteName]");
  process.exit(1);
}

const { sites } = loadConfig();

let targetSites = sites;

if (siteNameArg !== undefined) {
  const site = sites.find((s) => s.name === siteNameArg);

  if (!site) {
    console.error(
      `Unknown site "${siteNameArg}" - not in sites.json. Configured sites: ${sites.map((s) => s.name).join(", ")}`,
    );
    process.exit(1);
  }

  targetSites = [site];
}

let hasFailure = false;

for (const site of targetSites) {
  const result = await installBuild(buildUrl, site);

  if (result.status !== "success") {
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exit(1);
}
