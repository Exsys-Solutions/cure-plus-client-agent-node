/*
 *
 * Helper: `pathExists`.
 *
 */
import { access } from "node:fs/promises";

const pathExists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export default pathExists;
