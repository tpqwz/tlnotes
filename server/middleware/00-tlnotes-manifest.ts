/**
 * Runs before the platform PWA middleware (filename order) and serves the
 * TLNotes manifest for every URL an installer might request.
 * The share action is absolute: Android drops a relative one from the share sheet.
 */
import manifestBody from "../../public/manifest.webmanifest?raw";

interface ManifestEvent {
  url: URL;
  req: { method?: string; headers?: Headers };
}

function header(event: ManifestEvent, name: string) {
  return event.req.headers?.get(name)?.split(",")[0]?.trim() ?? "";
}

function originOf(event: ManifestEvent) {
  const host = header(event, "x-forwarded-host") || header(event, "host") || event.url.host;
  if (!host) return event.url.origin;
  const proto = header(event, "x-forwarded-proto") || event.url.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

const SHARE_PAGE = `<!doctype html><meta charset="utf-8"><title>TLNotes</title><script>(function(){var params=new URLSearchParams(location.search);var payload={title:params.get("title")||"",text:params.get("text")||"",url:params.get("url")||""};try{localStorage.setItem("tlnotes.inbox",JSON.stringify(payload))}catch(e){}var next=location.pathname.replace(/\\/share-target(?:\\/index\\.html)?\\/?$/,"/");location.replace(next||"/")})()</script>`;

export default function tlnotesManifestMiddleware(event: ManifestEvent, next: () => unknown) {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET") return next();
  const prefixMatch = /^(\/hds-[a-z0-9]+-\d+-[a-z0-9]+)/i.exec(event.url.pathname);
  const prefix = prefixMatch?.[1] ?? "";
  const path = prefix ? event.url.pathname.slice(prefix.length) || "/" : event.url.pathname;
  if (path === "/share-target" || path === "/share-target/" || path === "/share-target/index.html") {
    return new Response(SHARE_PAGE, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  if (
    path !== "/manifest.webmanifest" &&
    path !== "/__grok/manifest.webmanifest" &&
    path !== "/__grok/manifest.json"
  ) {
    return next();
  }
  let body = manifestBody;
  try {
    const data = JSON.parse(manifestBody) as {
      share_target?: { action?: string; method?: string; enctype?: string };
    };
    const origin = originOf(event);
    if (data.share_target && origin) {
      data.share_target.action = `${origin}${prefix}/share-target/index.html`;
      data.share_target.method = "GET";
      data.share_target.enctype = "application/x-www-form-urlencoded";
    }
    body = JSON.stringify(data);
  } catch {
    body = manifestBody;
  }
  return new Response(body, {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}