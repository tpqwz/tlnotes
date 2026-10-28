import { linkPreview, type LinkPreview, type Note } from "@/lib/tl/model";
import { smallImage } from "@/lib/tl/import-entity";

const AGENT = "TLNotes/1.0 (personal repertorium; local pictures)";
const tried = new Set<string>();

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

export async function fillShelf(
  notes: Note[],
  apply: (id: string, partial: Partial<Note>) => void,
  stopped: () => boolean,
) {
  for (const note of notes) {
    if (stopped()) return;
    const key = note.type === "link" ? `${note.id}:${note.url ?? ""}` : note.id;
    if (tried.has(key) || !needsPreview(note)) continue;
    tried.add(key);
    const preview = await previewFor(note.url ?? "");
    if (stopped()) {
      tried.delete(key);
      return;
    }
    if (preview) apply(note.id, { preview });
    await pause();
  }
}

function needsPreview(note: Note) {
  if (note.type !== "link" || !note.url) return false;
  if (note.preview?.bare) return false;
  if (!note.preview?.kept) return true;
  return !note.preview.image;
}

async function previewFor(url: string): Promise<LinkPreview | null> {
  const local = linkPreview(url);
  const wiki = wikiHostTitle(url);
  if (wiki) {
    const page = await wikiSummary(wiki.title, wiki.host);
    if (page) {
      const image = page.image ? await storeImage(page.image) : "";
      return { site: local?.site || hostName(url), line: page.line || local?.line || hostName(url), image: image || undefined, kept: true, bare: !page.image };
    }
  }
  const video = await youtubeTitle(url);
  if (video) {
    const image = local?.image ? await storeImage(local.image) : "";
    const picture = image || local?.image || "";
    return { site: local?.site || "YouTube", line: video, image: picture || undefined, kept: true, bare: !picture };
  }
  const fetched = (await readPage(url)) ?? (await viaMicrolink(url));
  if (!fetched) return null;
  const image = fetched.image ? await storeImage(fetched.image) : "";
  return {
    site: local?.site || hostName(url),
    line: fetched.line || local?.line || hostName(url),
    image: image || undefined,
    kept: true,
    bare: !fetched.image,
  };
}

function wikiHostTitle(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (!/\.(wikipedia|wiktionary|wikisource|wikiquote|wikibooks)\.org$/.test(host)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "wiki" || !parts[1]) return null;
    return { host, title: decodeURIComponent(parts.slice(1).join("/")).replace(/_/g, " ") };
  } catch {
    return null;
  }
}

async function wikiSummary(search: string, host = "en.wikipedia.org") {
  const title = await wikiTitle(search, host);
  if (!title) return null;
  try {
    const summary = (await getJson(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}`)) as {
      title?: string;
      extract?: string;
      description?: string;
      thumbnail?: { source?: string };
      type?: string;
    };
    if (summary.type === "disambiguation") return null;
    const line = summary.description || summary.title || title;
    return { line, image: summary.thumbnail?.source ?? "" };
  } catch {
    return null;
  }
}

async function wikiTitle(search: string, host: string) {
  const direct = search.trim();
  if (!direct) return "";
  try {
    const found = (await getJson(
      `https://${host}/w/api.php?action=opensearch&search=${encodeURIComponent(direct)}&limit=1&namespace=0&format=json&origin=*`,
    )) as [string, string[]];
    return found[1]?.[0] || direct;
  } catch {
    return direct;
  }
}

async function youtubeTitle(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (!host.includes("youtube.") && host !== "youtu.be") return "";
    const data = (await getJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)) as { title?: string };
    return data.title?.trim() ?? "";
  } catch {
    return "";
  }
}

async function readPage(url: string) {
  try {
    const response = await fetch(url, { headers: { Accept: "text/html" } });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 80_000) {
      const step = await reader.read();
      if (step.done) break;
      html += decoder.decode(step.value, { stream: true });
    }
    reader.cancel().catch(() => undefined);
    const line = meta(html, "og:title") || meta(html, "twitter:title") || tag(html);
    const image = meta(html, "og:image") || meta(html, "twitter:image");
    if (!line && !image) return null;
    return { line, image };
  } catch {
    return null;
  }
}

function meta(html: string, name: string) {
  const property = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"));
  return decode(match?.[1] ?? "");
}

function tag(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return decode(match?.[1] ?? "");
}

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hostName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function viaMicrolink(url: string) {
  try {
    const found = (await getJson(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)) as {
      status?: string;
      data?: { title?: string; description?: string; image?: { url?: string } | null };
    };
    if (found.status !== "success" || !found.data) return null;
    const line = found.data.title?.trim() || found.data.description?.trim() || "";
    const image = found.data.image?.url?.trim() || "";
    if (!line && !image) return null;
    return { line, image };
  } catch {
    return null;
  }
}

async function getJson(url: string) {
  let response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 429) {
    await pause();
    response = await fetch(url, { headers: { Accept: "application/json" } });
  }
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<unknown>;
}

export async function storeImage(url: string) {
  const small = smallImage(url);
  const data = (await asData(small)) || (small !== url ? await asData(url) : "");
  if (data) return data;
  return small.startsWith("https://") && small.length < 4_000 ? small : "";
}

async function asData(url: string) {
  try {
    const response = await fetch(url, { headers: { Accept: "image/*" } });
    if (!response.ok) return "";
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size < 80) return "";
    const modest = blob.size > 70_000 ? await shrink(blob) : blob;
    if (!modest || modest.size > 90_000) return "";
    const data = await readData(modest);
    return data.startsWith("data:image/") && data.length < 280_000 ? data : "";
  } catch {
    return "";
  }
}

function readData(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

async function shrink(blob: Blob) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const data = canvas.toDataURL("image/jpeg", 0.72);
    const bytes = Math.ceil((data.length - data.indexOf(",") - 1) * 0.75);
    return bytes > 0 && bytes < 90_000 ? await (await fetch(data)).blob() : null;
  } catch {
    return null;
  }
}
