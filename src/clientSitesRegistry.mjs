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

// `siteName` is optional - pass it when only one site's row is needed
// (getClientSiteRow/updateSiteActiveBuild below) so the backend can narrow
// the result set to a single row; omit it for a bulk fetch of every site
// registered under this clientId (registerSitesWithExsys). Either way the
// client-side filter stays too, as a safety net in case those params ever
// get ignored - same pattern as fetchPendingJob.mjs.
const fetchClientSiteRows = async (clientId, siteName) => {
  const data = await exsysGet(EXSYS_API_PATHS.GET_CLIENT_SITES, {
    clientId,
    ...(siteName ? { siteName } : {}),
  });

  return data.filter(
    (row) =>
      row.clientId === clientId && (!siteName || row.siteName === siteName),
  );
};

// Used before installing a new build, to read this site's *previous*
// lastUpdatedAt - the moment the build about to be replaced was itself
// installed - so the new build's own REACT_APP_LAST_BUILD_UPLOADED_TO_CLIENT_AT
// can be set to it (installBuild.mjs). That's what lets the release-notes
// modal show "what changed since your last update" instead of always
// falling back to its default 30-day window.
export const getClientSiteRow = async (clientId, siteName) => {
  const rows = await fetchClientSiteRows(clientId, siteName);
  return rows.find((row) => row.siteName === siteName);
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
  siteName,
  buildId,
  buildTime,
}) => {
  const existing = await getClientSiteRow(clientId, siteName);

  await exsysDml(EXSYS_API_PATHS.CLIENT_SITES_DML, [
    {
      ...existing,
      clientId,
      siteName,
      activeBuildId: buildId,
      activeBuildTime: buildTime,
      lastUpdatedAt: formatDateTime(),
      record_status: existing ? "u" : "n",
    },
  ]);
};
