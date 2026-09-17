/*
 *
 * Constants
 *
 */
export const EXSYS_API_BASE_URL = "https://demop.ex-his.com/ords/exsys_api";

// Same service-level token used everywhere else machine-to-machine in this
// system (see cure-plus-git-service-node's constants.mjs) - exsys's DML API
// has no per-caller auth beyond this single shared token, so it isn't a real
// secret boundary; it's here to match the existing convention, not to add
// security the platform doesn't actually enforce.
export const EXSYS_AUTHORIZATION = "111111";

export const POLL_INTERVAL_MS = 60_000;

export const DISCOVERY_INTERVAL_MS = 20 * 60_000;

// PLACEHOLDER PATHS - the client-deploy-jobs and client-sites tables don't
// exist in exsys yet. Named to match the existing
// ex_build_pkg/get_ex_build_data convention - confirm the real paths once
// those tables are created.
export const EXSYS_API_PATHS = {
  GET_CLIENT_DEPLOY_JOBS: "ex_client_deploy_jobs_pkg/get_client_deploy_jobs_data",
  CLIENT_DEPLOY_JOBS_DML: "ex_client_deploy_jobs_pkg/client_deploy_jobs_dml",
  GET_CLIENT_SITES: "ex_client_sites_pkg/get_client_sites_data",
  CLIENT_SITES_DML: "ex_client_sites_pkg/client_sites_dml",
};
