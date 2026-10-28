import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "artifacts", "restore-points");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = join(dir, `tlnotes-${stamp}.zip`);
const note = process.argv.slice(2).join(" ").trim();

const py = `
import os, sys, zipfile
root, out, note = sys.argv[1:]
skip = {"node_modules", "dist", ".vercel", ".git", "artifacts", "screenshots", "attachments"}
keep_ext = None
n = 0
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
    if note:
        z.writestr("RESTORE.txt", note + "\\n")
    for dirpath, names, files in os.walk(root):
        names[:] = [name for name in names if name not in skip and not name.startswith(".")]
        for name in files:
            if name.startswith("."):
                continue
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, root)
            z.write(path, rel)
            n += 1
print(n)
`;
const run = spawnSync("python3", ["-c", py, root, out, note], { encoding: "utf8" });
if (run.status !== 0) {
  process.stderr.write(run.stderr || "Could not write the restore point.\n");
  process.exit(run.status || 1);
}
process.stdout.write(`${out}\n${run.stdout}`);
