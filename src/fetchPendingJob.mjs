/*
 *
 * Helper: `fetchPendingJob`.
 *
 */
import { exsysGet } from "./exsysApi.mjs";
import { EXSYS_API_PATHS } from "./constants.mjs";

// Fetches the oldest still-pending job addressed to this machine's clientId.
// A job also carries a `siteId` (matching a site's `name` in sites.json) -
// it targets exactly that one site, not every site on the machine, since
// the admin's "install build" picker selects a specific site. See
// pollLoop.mjs for how that's resolved. Filtered client-side rather than
// via query params, since we don't yet know what filter params the real
// endpoint will support - this stays correct regardless, as long as the
// response includes clientId/siteId/status.
const fetchPendingJob = async (clientId) => {
  const data = await exsysGet(EXSYS_API_PATHS.GET_CLIENT_DEPLOY_JOBS);

  const pendingJobs = data
    .filter((job) => job.clientId === clientId && job.status === "pending")
    .sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || ""));

  return pendingJobs[0] || null;
};

export default fetchPendingJob;
