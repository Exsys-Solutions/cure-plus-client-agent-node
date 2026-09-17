/*
 *
 * Helper: `updateDeployJob`.
 *
 */
import { exsysDml } from "./exsysApi.mjs";
import { EXSYS_API_PATHS } from "./constants.mjs";

// Echoes the full job object back with record_status "u" (an exsys DML
// update replaces the row, it doesn't merge fields), so callers must pass
// the complete job, not a partial patch.
const updateDeployJob = (job) =>
  exsysDml(EXSYS_API_PATHS.CLIENT_DEPLOY_JOBS_DML, [
    { ...job, record_status: "u" },
  ]);

export default updateDeployJob;
