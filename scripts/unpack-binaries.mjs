import fs from "node:fs";
import path from "node:path";

const root = path.resolve("scripts/../.binpack");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
for (const item of manifest) {
  const b64 = item.ids.map((id) => fs.readFileSync(path.join(root, id), "utf8")).join("");
  fs.mkdirSync(path.dirname(item.path), { recursive: true });
  fs.writeFileSync(item.path, Buffer.from(b64, "base64"));
}
fs.rmSync(root, { recursive: true, force: true });
console.log(`restored ${manifest.length} files`);
