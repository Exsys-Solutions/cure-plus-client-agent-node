/*
 *
 * `pollLoop`: checks the central server for a pending install job addressed
 * to this machine, installs it onto the one site the job targets (job.siteId,
 * matching a site's `name` in sites.json - see the admin "install build"
 * picker design), and streams progress back onto the job's row.
 *
 */
import { loadConfig } from "./config.mjs";
import { POLL_INTERVAL_MS } from "./constants.mjs";
import fetchPendingJob from "./fetchPendingJob.mjs";
import updateDeployJob from "./updateDeployJob.mjs";
import { updateSiteActiveBuild } from "./clientSitesRegistry.mjs";
import installBuild from "./installBuild.mjs";
import createStreamingLogger from "./createStreamingLogger.mjs";
import createLogger from "./createLogger.mjs";
import formatDateTime from "./formatDateTime.mjs";

const baseLogger = createLogger("poll-loop");

const runPendingJobIfAny = async () => {
  // Loaded fresh every tick (cheap - a local file read) rather than once at
  // startup, so sites the discovery loop adds/removes on disk take effect
  // on the very next poll without needing a restart.
  const { clientId, sites } = loadConfig();

  const job = await fetchPendingJob(clientId);

  if (!job) return;

  const site = sites.find((s) => s.name === job.siteId);

  if (!site) {
    baseLogger.error(
      `Job ${job.jobId} targets site "${job.siteId}", which isn't configured on this machine (known sites: ${sites.map((s) => s.name).join(", ")})`,
    );

    await updateDeployJob({
      ...job,
      status: "failure",
      errorMessage: `Unknown site "${job.siteId}" on this machine`,
      finishedAt: formatDateTime(),
    });

    return;
  }

  baseLogger.info(
    `Found pending job ${job.jobId} - installing ${job.buildUrl} to "${site.name}"`,
  );

  // Claim it immediately (status -> in-progress, log cleared) before doing
  // any real work, so a crash/restart mid-poll doesn't leave this job
  // looking "pending" forever and get picked up twice.
  let accumulatedLog = "";
  await updateDeployJob({
    ...job,
    status: "in-progress",
    agentLog: accumulatedLog,
    startedAt: formatDateTime(),
  });

  const pushProgress = (type, message) => {
    accumulatedLog += `[${type}] ${message}\n`;

    // Best-effort - a failed progress push shouldn't abort the install
    // itself, it just means this one update doesn't reach the viewer.
    updateDeployJob({
      ...job,
      status: "in-progress",
      agentLog: accumulatedLog,
    }).catch((error) =>
      baseLogger.warning(`Could not push progress: ${error.message}`),
    );
  };

  const streamingLogger = createStreamingLogger(
    `install-build:${site.name}`,
    pushProgress,
  );

  const result = await installBuild(job.buildUrl, site, streamingLogger);

  if (result.status === "success") {
    // Best-effort, same as progress pushes above - the install itself
    // already succeeded, so a failure recording that centrally shouldn't
    // turn this job into a reported failure.
    try {
      await updateSiteActiveBuild({
        clientId,
        siteId: site.name,
        buildId: job.buildId,
        buildTime: job.buildTime,
      });
    } catch (error) {
      baseLogger.warning(
        `Could not update site's active build in exsys: ${error.message}`,
      );
    }
  }

  await updateDeployJob({
    ...job,
    status: result.status === "success" ? "success" : "failure",
    agentLog: accumulatedLog,
    errorMessage: result.errorMessage || "",
    finishedAt: formatDateTime(),
  });
};

const startPollLoop = async () => {
  baseLogger.info(`Starting poll loop (every ${POLL_INTERVAL_MS / 1000}s)`);

  // Deliberately sequential, not setInterval - a slow/hanging install never
  // overlaps with the next poll tick.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runPendingJobIfAny();
    } catch (error) {
      baseLogger.error(`Poll cycle failed: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
};

export default startPollLoop;
