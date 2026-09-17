/*
 *
 * `clientSitesRegistry`: everything that reads/writes the central
 * client-sites table - what the admin's "install build" picker lists, and
 * what shows each site's currently active build and when it last changed.
 * Both operations here fetch the existing row(s) first and merge into them
 * rather than posting a bare partial object, since an exsys DML update
 * replaces the row it targets - without the merge, registerSitesWithExsys's
 * periodic re-registration (every 20 minutes, see discoveryLoop.mjs) would
 * wipe out the activeBuildId/activeBuildTime updateSiteActiveBuild just
 * wrote after a deploy.
 *
 */
import { exsysGet, exsysDml } from "./exsysApi.mjs";
import { EXSYS_API_PATHS } from "./constants.mjs";
import formatDateTime from "./formatDateTime.mjs";

const fetchClientSiteRows = async (clientId) => {
  const data = await exsysGet(EXSYS_API_PATHS.GET_CLIENT_SITES);
  return data.filter((row) => row.clientId === clientId);
};

// Registers this machine's discovered sites centrally, purely so the picker
// can list them by name. Deliberately only pushes clientId + siteName + a
// freshness timestamp for a *new* row - not servedBuildFolderPath or
// reactAppOverrides (URLs, NPHIES key), which stay local to this agent's
// sites.json and get resolved by siteName once a deploy job actually comes
// in. The central registry only needs enough to render a picker, not this
// machine's file layout or secrets.
export const registerSitesWithExsys = async (clientId, discoveredSites) => {
  if (discoveredSites.length === 0) return;

  const existingRows = await fetchClientSiteRows(clientId);
  const now = formatDateTime();

  const rows = discoveredSites.map((site) => {
    const existing = existingRows.find((row) => row.siteName === site.name);

    return {
      ...existing,
      clientId,
      siteName: site.name,
      lastSeenAt: now,
      record_status: existing ? "u" : "n",
    };
  });

  await exsysDml(EXSYS_API_PATHS.CLIENT_SITES_DML, rows);
};

// Called after a successful install, so the registry reflects which build
// is actually live on this site right now and when that happened - what
// the admin picker shows as each site's current version. `buildId`/
// `buildTime` are expected to match ex_build_pkg's own buildID/buildTime
// naming (see cure-plus-git-service-node), since the admin's job-creation
// step copies them from the build row the admin picked onto the deploy job
// - see fetchPendingJob.mjs.
export const updateSiteActiveBuild = async ({
  clientId,
  siteId,
  buildId,
  buildTime,
}) => {
  const existingRows = await fetchClientSiteRows(clientId);
  const existing = existingRows.find((row) => row.siteName === siteId);

  await exsysDml(EXSYS_API_PATHS.CLIENT_SITES_DML, [
    {
      ...existing,
      clientId,
      siteName: siteId,
      activeBuildId: buildId,
      activeBuildTime: buildTime,
      lastUpdatedAt: formatDateTime(),
      record_status: existing ? "u" : "n",
    },
  ]);
};
