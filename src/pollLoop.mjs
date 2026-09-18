/*
 *
 * `pollLoop`: checks the central server for a pending install job addressed
 * to this machine, installs it onto the one site the job targets
 * (job.siteName, matching a site's `name` in sites.json - see the admin
 * "install build" picker design), and streams progress back onto the
 * job's row.
 *
 */
import { loadConfig } from "./config.mjs";
import { POLL_INTERVAL_MS } from "./constants.mjs";
import fetchPendingJob from "./fetchPendingJob.mjs";
import updateDeployJob from "./updateDeployJob.mjs";
import { getClientSiteRow, updateSiteActiveBuild } from "./clientSitesRegistry.mjs";
import installBuild from "./installBuild.mjs";
import createStreamingLogger from "./createStreamingLogger.mjs";
import createLogger from "./createLogger.mjs";
import formatDateTime, { parseDateTime } from "./formatDateTime.mjs";

const baseLogger = createLogger("poll-loop");

const runPendingJobIfAny = async () => {
  // Loaded fresh every tick (cheap - a local file read) rather than once at
  // startup, so sites the discovery loop adds/removes on disk take effect
  // on the very next poll without needing a restart.
  const { clientId, sites } = loadConfig();

  const job = await fetchPendingJob(clientId);

  if (!job) return;

  const site = sites.find((s) => s.name === job.siteName);

  if (!site) {
    baseLogger.error(
      `Job ${job.jobId} targets site "${job.siteName}", which isn't configured on this machine (known sites: ${sites.map((s) => s.name).join(", ")})`,
    );

    await updateDeployJob({
      ...job,
      status: "failure",
      errorMessage: `Unknown site "${job.siteName}" on this machine`,
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

  // Best-effort: this site's *previous* lastUpdatedAt, so installBuild can
  // carry it forward into the new build's own
  // REACT_APP_LAST_BUILD_UPLOADED_TO_CLIENT_AT (see installBuild.mjs) - a
  // lookup failure here shouldn't block the install, it just means that key
  // comes out blank on this one build.
  const existingSiteRow = await getClientSiteRow(clientId, site.name).catch(
    (error) => {
      baseLogger.warning(
        `Could not look up "${site.name}"'s previous lastUpdatedAt: ${error.message}`,
      );
      return undefined;
    },
  );

  // A rollback (or just picking an older build via "install build") installs
  // a build that's chronologically *older* than what's currently live. In
  // that case the site's lastUpdatedAt would be later than this build's own
  // creation date, which would hand ReleaseNotesModal.tsx an inverted range
  // (start-after-end) - so we deliberately leave
  // REACT_APP_LAST_BUILD_UPLOADED_TO_CLIENT_AT blank instead, which makes it
  // fall back to its own default (30 days before the build's own date).
  const isDowngrade =
    !!existingSiteRow?.activeBuildTime &&
    parseDateTime(job.buildTime) < parseDateTime(existingSiteRow.activeBuildTime);

  const result = await installBuild(
    job.buildUrl,
    {
      ...site,
      previousBuildUploadedAt: isDowngrade
        ? ""
        : existingSiteRow?.lastUpdatedAt,
    },
    streamingLogger,
  );

  if (result.status === "success") {
    // Best-effort, same as progress pushes above - the install itself
    // already succeeded, so a failure recording that centrally shouldn't
    // turn this job into a reported failure.
    try {
      await updateSiteActiveBuild({
        clientId,
        siteName: site.name,
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
