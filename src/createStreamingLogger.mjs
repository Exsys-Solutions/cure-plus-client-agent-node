/*
 *
 * Helper: `createStreamingLogger`.
 *
 */
import createLogger from "./createLogger.mjs";

// Wraps createLogger so every line is both printed locally on this machine
// and handed to onLine - the poll loop uses onLine to push the growing log
// back onto the job's row (see updateDeployJob.mjs) so the admin modal,
// polling that same row, can show step-by-step progress to whoever's
// watching. There's no direct connection from the admin browser to this
// machine to push over, so "streaming" here means "frequently publish
// cumulative progress, let the viewer poll it."
const createStreamingLogger = (calledFrom, onLine) => {
  const base = createLogger(calledFrom);

  const wrap = (type) => (message) => {
    base[type](message);
    onLine?.(type, message);
  };

  return {
    info: wrap("info"),
    success: wrap("success"),
    warning: wrap("warning"),
    error: wrap("error"),
  };
};

export default createStreamingLogger;
