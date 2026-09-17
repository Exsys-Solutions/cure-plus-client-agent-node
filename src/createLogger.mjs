/*
 *
 * Helper: `createLogger`.
 *
 */
import chalk from "chalk";
import logger from "./logger.mjs";

const createLogger = (calledFrom = "unknown") => ({
  info: (message) =>
    logger.info(`${chalk.magenta(`[${calledFrom}]`)} ${message}`),
  success: (message) =>
    logger.success(`${chalk.magenta(`[${calledFrom}]`)} ${message}`),
  warning: (message) =>
    logger.warning(`${chalk.magenta(`[${calledFrom}]`)} ${message}`),
  error: (message) =>
    logger.error(`${chalk.magenta(`[${calledFrom}]`)} ${message}`),
});

export default createLogger;
