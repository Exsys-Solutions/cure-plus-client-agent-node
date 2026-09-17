/*
 *
 * Helper: `extractBuildArchive`.
 *
 */
import AdmZip from "adm-zip";

// Pure-JS zip extraction rather than shelling out to `tar` - this agent runs
// unattended on 20 different Windows machines, and which `tar` a bare
// "tar" command resolves to on PATH there isn't something this can rely on
// (confirmed the hard way: Git Bash's bundled GNU tar misparses a
// "C:\..." path as a remote-host spec and fails outright). A library has no
// such PATH/shell dependency.
const extractBuildArchive = async (archivePath, destDir) => {
  const zip = new AdmZip(archivePath);
  zip.extractAllTo(destDir, true);
};

export default extractBuildArchive;
