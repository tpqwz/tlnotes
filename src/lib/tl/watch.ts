import { CapacitorHttp } from "@capacitor/core";
import type { MediaFacts } from "@/lib/tl/model";
import { compressVideo, fetchMedia, mediaAddress } from "@/lib/tl/media";

const BYTE_CAP = 8_000_000;
const YT_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const YT_VERSION = "19.44.38";

type Format = {
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  contentLength?: string;
  audioQuality?: string;
  signatureCipher?: string;
};

export type Ingested = {
  kind: "image" | "video";
  data: string;
  facts: MediaFacts;
  poster: string;
  caption: string;
  keptFile: boolean;
};

function nativeShell() {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

async function postJson(url: string, body: unknown, headers: Record<string, string>) {
  if (nativeShell()) {
    const response = await CapacitorHttp.post({
      url,
      headers: { "Content-Type": "application/json", ...headers },
      data: body,
      responseType: "json",
    });
    if (response.status >= 400) throw new Error("Could not read that video.");
    return response.data;
  }
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Could not read that video.");
  return response.json();
}

async function getJson(url: string) {
  if (nativeShell()) {
    const response = await CapacitorHttp.get({ url, responseType: "json" });
    if (response.status >= 400) throw new Error("Could not read that video.");
    return response.data;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not read that video.");
  return response.json();
}

async function download(url: string, mime: string) {
  if (nativeShell()) {
    const response = await CapacitorHttp.get({ url, responseType: "arraybuffer" });
    if (response.status >= 400) throw new Error("Could not copy that file.");
    const bytes = bytesOf(response.data);
    if (bytes.byteLength > BYTE_CAP) throw new Error("too-large");
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return new Blob([copy], { type: mime || "application/octet-stream" });
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not copy that file.");
  const blob = await response.blob();
  if (blob.size > BYTE_CAP) throw new Error("too-large");
  return blob;
}

function bytesOf(data: unknown) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer);
  if (typeof data === "string") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  throw new Error("Could not copy that file.");
}

function asDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not keep that audio."));
    reader.readAsDataURL(blob);
  });
}

export function splitAddress(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const found = [...trimmed.matchAll(/https?:\/\/[^\s<>"']+/gi)].map((match) => match[0].replace(/[),.]+$/, ""));
  const raw = found.length === 1 ? found[0] : !/\s/.test(trimmed) && /^https?:\/\//i.test(trimmed) ? trimmed : "";
  if (!raw) return null;
  const caption = trimmed.replace(raw, "").replace(/\s+/g, " ").trim();
  if (caption.length > 80) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { href: url.href, caption };
  } catch {
    return null;
  }
}

function youtubeId(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v") ?? "";
    return url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?]+)/)?.[1] ?? "";
  }
  return "";
}

function vimeoId(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com") return "";
  return url.pathname.split("/").find((part) => /^\d+$/.test(part)) ?? "";
}

function isAudioPage(url: URL) {
  return url.hostname.replace(/^www\./, "") === "music.youtube.com";
}

function lowestVideo(formats: Format[]) {
  return formats
    .filter((format) => format.url && !format.signatureCipher && format.height && format.width)
    .sort((a, b) => (a.height || 0) - (b.height || 0) || (a.bitrate || 0) - (b.bitrate || 0))[0];
}

function mediumOpus(formats: Format[]) {
  const audio = formats.filter((format) => format.url && !format.signatureCipher && /audio\//.test(format.mimeType || ""));
  const opus = audio.filter((format) => /opus|audio\/webm/i.test(format.mimeType || ""));
  const pool = opus.length > 0 ? opus : audio;
  return pool.find((format) => format.audioQuality === "AUDIO_QUALITY_MEDIUM") ?? pool[Math.floor(pool.length / 2)] ?? pool[0];
}

async function keepFile(format: Format | undefined, audio: boolean) {
  const length = Number(format?.contentLength || 0);
  if (!format?.url || (length > BYTE_CAP)) return "";
  try {
    const blob = await download(format.url, format.mimeType || (audio ? "audio/webm" : "video/mp4"));
    if (audio) {
      const data = await asDataUrl(blob);
      return data.startsWith("data:audio/") || data.startsWith("data:video/") ? data : "";
    }
    const kept = await compressVideo(blob, "video");
    return kept.data;
  } catch {
    return "";
  }
}

async function takeYoutube(page: string, url: URL): Promise<Ingested> {
  const id = youtubeId(url);
  const poster = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
  const audio = isAudioPage(url);
  const base: Ingested = {
    kind: "video",
    data: "",
    poster,
    caption: "",
    keptFile: false,
    facts: { url: page },
  };
  if (!/^[\w-]{6,}$/.test(id)) return base;
  try {
    const player = await postJson(
      `https://www.youtube.com/youtubei/v1/player?key=${YT_KEY}&prettyPrint=false`,
      { context: { client: { clientName: "ANDROID", clientVersion: YT_VERSION, androidSdkVersion: 34, hl: "en", gl: "US" } }, videoId: id },
      { "User-Agent": `com.google.android.youtube/${YT_VERSION} (Linux; U; Android 14) gzip` },
    );
    const details = player?.videoDetails ?? {};
    const streaming = player?.streamingData ?? {};
    const chosen = audio ? mediumOpus(streaming.adaptiveFormats ?? []) : lowestVideo(streaming.formats ?? []);
    const seconds = Number(details.lengthSeconds);
    const facts: MediaFacts = {
      name: typeof details.title === "string" ? details.title : undefined,
      url: page,
      width: chosen?.width,
      height: chosen?.height,
      bytes: Number(chosen?.contentLength || 0) || undefined,
      seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
    };
    const data = await keepFile(chosen, audio);
    return { kind: "video", data, poster, caption: "", keptFile: Boolean(data), facts };
  } catch {
    return base;
  }
}

async function takeVimeo(page: string, url: URL): Promise<Ingested> {
  const id = vimeoId(url);
  const base: Ingested = { kind: "video", data: "", poster: "", caption: "", keptFile: false, facts: { url: page } };
  if (!id) return base;
  let facts: MediaFacts = { url: page };
  let poster = "";
  try {
    const embed = await getJson(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`);
    if (typeof embed?.title === "string") facts = { ...facts, name: embed.title };
    if (typeof embed?.thumbnail_url === "string") poster = embed.thumbnail_url;
    if (typeof embed?.duration === "number") facts = { ...facts, seconds: embed.duration };
    if (typeof embed?.width === "number") facts = { ...facts, width: embed.width };
    if (typeof embed?.height === "number") facts = { ...facts, height: embed.height };
  } catch {
    poster = "";
  }
  try {
    const config = await getJson(`https://player.vimeo.com/video/${id}/config`);
    const progressive = config?.request?.files?.progressive;
    const formats: Format[] = Array.isArray(progressive)
      ? progressive.map((item: { url?: string; width?: number; height?: number; mime?: string; size?: number }) => ({
          url: item.url,
          width: item.width,
          height: item.height,
          mimeType: item.mime || "video/mp4",
          contentLength: item.size ? String(item.size) : undefined,
        }))
      : [];
    const chosen = lowestVideo(formats);
    if (chosen?.width) facts = { ...facts, width: chosen.width, height: chosen.height, bytes: Number(chosen.contentLength || 0) || facts.bytes };
    const data = await keepFile(chosen, false);
    return { kind: "video", data, poster, caption: "", keptFile: Boolean(data), facts };
  } catch {
    return { ...base, poster, facts };
  }
}

/** A direct picture or clip, or a video page. Anything else is left for an ordinary link. */
export async function ingestAddress(text: string): Promise<Ingested | null> {
  const split = splitAddress(text);
  if (!split) return null;
  if (mediaAddress(split.href)) {
    const taken = await fetchMedia(split.href);
    return { kind: taken.kind, data: taken.data, facts: taken.facts, poster: "", caption: split.caption, keptFile: Boolean(taken.data) };
  }
  let url: URL;
  try {
    url = new URL(split.href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "vimeo.com" && vimeoId(url)) {
    const taken = await takeVimeo(split.href, url);
    return { ...taken, caption: split.caption };
  }
  if (youtubeId(url)) {
    const taken = await takeYoutube(split.href, url);
    return { ...taken, caption: split.caption };
  }
  return null;
}
