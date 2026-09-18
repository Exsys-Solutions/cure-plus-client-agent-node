/*
 *
 * Helper: `fetchPendingJob`.
 *
 */
import { exsysGet } from "./exsysApi.mjs";
import { EXSYS_API_PATHS } from "./constants.mjs";

// Fetches the oldest still-pending job addressed to this machine's clientId.
// A job also carries a `siteName` (matching a site's `name` in sites.json) -
// it targets exactly that one site, not every site on the machine, since
// the admin's "install build" picker selects a specific site. See
// pollLoop.mjs for how that's resolved. clientId/status are passed as query
// params so the backend can narrow it down server-side (see
// EXSYS_API_SQL.sql's get_client_deploy_jobs_data), but the client-side
// filter stays too as a safety net in case those params ever get ignored.
const fetchPendingJob = async (clientId) => {
  const data = await exsysGet(EXSYS_API_PATHS.GET_CLIENT_DEPLOY_JOBS, {
    clientId,
    status: "pending",
  });

  const pendingJobs = data
    .filter((job) => job.clientId === clientId && job.status === "pending")
    .sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || ""));

  return pendingJobs[0] || null;
};

export default fetchPendingJob;
