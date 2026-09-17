/*
 *
 * Helper: `patchEnvConfig`.
 *
 */
import { readFile, writeFile } from "node:fs/promises";

// Matches `KEY: "any value"` inside the window._RUNTIME_CONFIG_ object
// literal. Targeted per-key replacement (not parse-and-reserialize the whole
// object) so every other key - version, build date/time/branch, subdir, gpt
// token - keeps its exact original formatting untouched.
const buildKeyPattern = (key) => new RegExp(`(\\b${key}\\s*:\\s*)"[^"]*"`);

// `overrides` values are written back as their own quoted string - a
// missing/empty value still overwrites with an empty string rather than
// being skipped, so a site's env-config.js never keeps a stale value from a
// previous build once this key is meant to be managed here.
const patchEnvConfig = async (envConfigPath, overrides) => {
  let content = await readFile(envConfigPath, "utf8");

  for (const [key, value] of Object.entries(overrides)) {
    const pattern = buildKeyPattern(key);

    if (!pattern.test(content)) {
      throw new Error(
        `env-config.js is missing expected key "${key}" - refusing to install a build whose runtime config doesn't match what this agent expects.`,
      );
    }

    content = content.replace(pattern, `$1${JSON.stringify(String(value ?? ""))}`);
  }

  await writeFile(envConfigPath, content, "utf8");
};

export default patchEnvConfig;
