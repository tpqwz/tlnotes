/**
 * Answers every install-manifest URL with public/manifest.webmanifest.
 * Registered before the platform PWA plugin so a preview host cannot
 * fall back to the name "Grok App".
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "../public/manifest.webmanifest");
const SHARE_PATH = join(dirname(fileURLToPath(import.meta.url)), "../public/share-target/index.html");

function isInstallPage(url) {
  const query = String(url ?? "").split("?", 2)[1] ?? "";
  const params = new URLSearchParams(query);
  const install = params.get("install");
  return install === "1" || install === "true";
}

function header(req, name) {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value || "").split(",")[0].trim();
}

function originOf(req) {
  const host = header(req, "x-forwarded-host") || header(req, "host");
  if (!host) return "";
  const proto = header(req, "x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function prefixOf(pathOnly, req) {
  const fromPath = /^(\/hds-[a-z0-9]+-\d+-[a-z0-9]+)/i.exec(pathOnly);
  if (fromPath) return fromPath[1];
  try {
    return /^(\/hds-[a-z0-9]+-\d+-[a-z0-9]+)/i.exec(new URL(header(req, "referer")).pathname)?.[1] ?? "";
  } catch {
    return "";
  }
}

function isManifestPath(pathOnly) {
  return /^(\/hds-[a-z0-9]+-\d+-[a-z0-9]+)?\/(?:manifest\.webmanifest|__grok\/manifest\.webmanifest|__grok\/manifest\.json)$/i.test(pathOnly);
}

function isSharePath(pathOnly) {
  return /^(\/hds-[a-z0-9]+-\d+-[a-z0-9]+)?\/share-target(?:\/(?:index\.html)?)?$/i.test(pathOnly);
}

function manifestBody(req, pathOnly) {
  const data = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const origin = originOf(req);
  const prefix = prefixOf(pathOnly, req);
  if (origin) {
    data.scope = `${origin}${prefix}/`;
    data.start_url = `${origin}${prefix}/`;
    data.id = `${origin}${prefix}/tlnotes`;
    data.share_target = {
      action: `${origin}${prefix}/share-target/index.html`,
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    };
    if (Array.isArray(data.icons)) {
      data.icons = data.icons.map((icon) =>
        typeof icon.src === "string" && icon.src.startsWith("/") ? { ...icon, src: `${origin}${prefix}${icon.src}` } : icon,
      );
    }
  }
  return Buffer.from(JSON.stringify(data));
}

export function tlnotesManifestPlugin() {
  return {
    name: "tlnotes-manifest",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathOnly = rawUrl.split("?", 1)[0] ?? "";
        if (isManifestPath(pathOnly)) {
          const body = manifestBody(req, pathOnly);
          res.statusCode = 200;
          res.setHeader("content-type", "application/manifest+json; charset=utf-8");
          res.setHeader("cache-control", "no-cache");
          res.setHeader("content-length", String(body.byteLength));
          res.end(body);
          return;
        }
        if (isSharePath(pathOnly)) {
          const body = readFileSync(SHARE_PATH);
          res.statusCode = 200;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("cache-control", "no-cache");
          res.setHeader("content-length", String(body.byteLength));
          res.end(body);
          return;
        }
        if (!isInstallPage(rawUrl)) {
          next();
          return;
        }
        const chunks = [];
        const origEnd = res.end.bind(res);
        res.write = (chunk, enc, cb) => {
          if (typeof enc === "function") {
            cb = enc;
            enc = undefined;
          }
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
          if (typeof cb === "function") cb();
          return true;
        };
        res.end = (chunk, enc, cb) => {
          if (typeof chunk === "function") {
            cb = chunk;
            chunk = undefined;
            enc = undefined;
          } else if (typeof enc === "function") {
            cb = enc;
            enc = undefined;
          }
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
          let body = Buffer.concat(chunks);
          const type = String(res.getHeader("content-type") ?? "");
          if (type.includes("text/html")) {
            body = Buffer.from(body.toString("utf8").replaceAll("Grok App", "TLNotes"));
            res.setHeader("content-length", String(body.length));
          }
          return origEnd(body, cb);
        };
        next();
      });
    },
  };
}
