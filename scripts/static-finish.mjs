/**
 * The SPA shell is written as `_shell.html` and can name a stylesheet
 * hash that the client build did not emit. Surge wants `index.html`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "dist/client";
const css = readdirSync(join(root, "assets")).find((name) => name.startsWith("styles-") && name.endsWith(".css"));
if (!css) throw new Error("static build has no stylesheet");
const raw = readFileSync(join(root, "_shell.html")).filter((byte) => byte !== 0);
const html = Buffer.from(raw)
  .toString("utf8")
  .replaceAll(/\/assets\/styles-[A-Za-z0-9_-]+\.css/g, `/assets/${css}`);
writeFileSync(join(root, "index.html"), html);
writeFileSync(join(root, "200.html"), html);
console.log(`static host folder: dist/client (stylesheet ${css})`);
