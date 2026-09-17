/*
 *
 * Helper: `moveDirectory`.
 *
 */
import fs from "node:fs/promises";

// fs.rename is instant but fails with EXDEV when source and destination are
// on different drives (likely here - the extracted build lives under the OS
// temp dir, the served path is wherever the site is actually hosted from) -
// fall back to a recursive copy + cleanup in that case.
const moveDirectory = async (source, destination) => {
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;

    await fs.cp(source, destination, { recursive: true });
    await fs.rm(source, { recursive: true, force: true });
  }
};

export default moveDirectory;
