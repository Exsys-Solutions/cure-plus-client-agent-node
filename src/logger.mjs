/*
 *
 * Helper: `logger`.
 *
 */
import chalk from "chalk";

const formatDate = () =>
  new Date().toLocaleString("en-GB", {
    hour12: false,
  });

const logger = {
  info: (msg) =>
    console.log(
      `${chalk.gray(`[${formatDate()}]`)} ${chalk.blue("INFO")} ${msg}`,
    ),

  success: (msg) =>
    console.log(
      `${chalk.gray(`[${formatDate()}]`)} ${chalk.green("SUCCESS")} ${msg}`,
    ),

  warning: (msg) =>
    console.log(
      `${chalk.gray(`[${formatDate()}]`)} ${chalk.yellow("WARNING")} ${msg}`,
    ),

  error: (msg) =>
    console.log(
      `${chalk.gray(`[${formatDate()}]`)} ${chalk.red("ERROR")} ${msg}`,
    ),
};

export default logger;
