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
writeFileSync(join(root, "404.html"), html);
writeFileSync(join(root, ".nojekyll"), "");
const base = (process.env.TLNOTES_BASE ?? "").trim();
if (base === "/tlnotes" || base === "/tlnotes/") {
  const manifestPath = join(root, "manifest.webmanifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const origin = "https://tpqwz.github.io/tlnotes";
  manifest.name = "TLNotes";
  manifest.short_name = "TLNotes";
  manifest.id = `${origin}/`;
  manifest.scope = `${origin}/`;
  manifest.start_url = `${origin}/`;
  if (Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map((icon) =>
      typeof icon?.src === "string" && icon.src.startsWith("/") ? { ...icon, src: `${origin}${icon.src}` } : icon,
    );
  }
  manifest.share_target = {
    action: `${origin}/share-target/index.html`,
    method: "GET",
    enctype: "application/x-www-form-urlencoded",
    params: { title: "title", text: "text", url: "url" },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`static host folder: dist/client (stylesheet ${css})`);
