import type { MediaFacts } from "@/lib/tl/model";
import { keepsFiles } from "@/lib/tl/native-sync";

const IMAGE_CAP = 280_000;
const VIDEO_CAP = 1_200_000;
const CLIP_SECONDS = 20;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|heif|heic|mp4|webm|mov|m4v|mkv)(?:$|[?#])/i;

export type KeptMedia = { data: string; facts: MediaFacts };

export function mediaAddress(value: string) {
  const text = value.trim();
  if (!/^https?:\/\/\S+$/i.test(text)) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!MEDIA_EXT.test(url.pathname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

export async function compressImage(file: Blob, name = ""): Promise<KeptMedia> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Could not read that picture.");
  try {
    let edge = 1280;
    let quality = 0.82;
    let url = paint(bitmap, edge, quality);
    for (let attempt = 0; url.length >= IMAGE_CAP && attempt < 6; attempt += 1) {
      quality -= 0.12;
      if (quality < 0.45) {
        quality = 0.62;
        edge = Math.round(edge * 0.72);
      }
      url = paint(bitmap, edge, quality);
    }
    if (url.length >= IMAGE_CAP) throw new Error("That picture is still too large.");
    return { data: url, facts: factsOf(name, bitmap.width, bitmap.height, file.size) };
  } finally {
    bitmap.close();
  }
}

function paint(bitmap: ImageBitmap, edge: number, quality: number) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not shrink that picture.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function compressVideo(file: Blob, name = ""): Promise<KeptMedia> {
  const object = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  video.hidden = true;
  document.body.appendChild(video);
  video.src = object;
  try {
    await once(video, "loadedmetadata");
    const full = video.duration;
    if (!Number.isFinite(full) || full <= 0) throw new Error("Could not read that video.");
    const seconds = Math.min(full, CLIP_SECONDS);
    const facts = factsOf(name, video.videoWidth, video.videoHeight, file.size, full);
    if (file.size < 500_000 && full <= CLIP_SECONDS && (file.type === "video/mp4" || file.type === "video/webm")) {
      const kept = await blobToDataUrl(file);
      if (kept.length < VIDEO_CAP) return { data: kept, facts };
    }
    const shrunk = await recode(video, seconds);
    if (shrunk.length >= VIDEO_CAP) throw new Error("That video is still too large after shrinking.");
    return { data: shrunk, facts };
  } finally {
    video.pause();
    video.remove();
    URL.revokeObjectURL(object);
  }
}

async function recode(video: HTMLVideoElement, seconds: number) {
  const mime = ["video/mp4", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error("This browser cannot shrink a video.");
  const scale = Math.min(1, 480 / Math.max(video.videoWidth || 480, video.videoHeight || 480));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round((video.videoWidth || 480) * scale) & ~1);
  canvas.height = Math.max(2, Math.round((video.videoHeight || 480) * scale) & ~1);
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function") throw new Error("This browser cannot shrink a video.");
  const stream = canvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 280_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("Could not shrink that video."));
  });
  video.currentTime = 0;
  recorder.start(250);
  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play();
  }
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const draw = () => {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (video.ended || video.currentTime >= seconds || performance.now() - started > seconds * 1000 + 500) {
        resolve();
        return;
      }
      requestAnimationFrame(draw);
    };
    draw();
  });
  video.pause();
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await stopped;
  stream.getTracks().forEach((track) => track.stop());
  return blobToDataUrl(blob);
}

function once(video: HTMLVideoElement, event: "loadedmetadata") {
  return new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error("Could not read that video."));
    video.addEventListener(event, () => resolve(), { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not keep that clip."));
    reader.readAsDataURL(blob);
  });
}

function factsOf(name: string, width: number, height: number, bytes: number, seconds?: number): MediaFacts {
  const facts: MediaFacts = {};
  const keptName = name.trim();
  if (keptName) facts.name = keptName;
  if (width > 0) facts.width = Math.round(width);
  if (height > 0) facts.height = Math.round(height);
  if (bytes > 0) facts.bytes = bytes;
  if (seconds && Number.isFinite(seconds) && seconds > 0) facts.seconds = Math.round(seconds * 10) / 10;
  return facts;
}

function fileName(url: URL, header: string | null) {
  const match = header?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  const fromHeader = match?.[1] ? decodeURIComponent(match[1].replace(/"/g, "")) : "";
  const fromPath = decodeURIComponent(url.pathname.split("/").pop() || "");
  return (fromHeader || fromPath).slice(0, 180);
}

function kindOfBlob(type: string, name: string): "image" | "video" | "" {
  if (type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(name)) return "video";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif|heif|heic)$/i.test(name)) return "image";
  return "";
}

/** Copies a picture or video from an address when the site allows it. Otherwise keeps the address itself. */
export async function fetchMedia(address: string): Promise<{ kind: "image" | "video"; data: string; facts: MediaFacts }> {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new Error("That address is not a link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("That address is not a link.");
  const hinted = fileName(url, null);
  const kindHint = kindOfBlob("", hinted);
  if (!keepsFiles()) return { kind: kindHint === "video" ? "video" : "image", data: url.href, facts: { name: hinted, url: url.href } };
  try {
    const response = await fetch(url.href);
    if (!response.ok) throw new Error("That address did not answer.");
    const name = fileName(url, response.headers.get("content-disposition"));
    const blob = await response.blob();
    const kind = kindOfBlob(blob.type || response.headers.get("content-type") || "", name);
    if (!kind) throw new Error("That address is not a picture or a video.");
    const kept = kind === "video" ? await compressVideo(blob, name) : await compressImage(blob, name);
    return { kind, data: kept.data, facts: { ...kept.facts, name: name || kept.facts.name, url: url.href, bytes: blob.size || kept.facts.bytes } };
  } catch (error) {
    if (error instanceof TypeError && kindHint) return { kind: kindHint, data: url.href, facts: { name: hinted, url: url.href } };
    throw error instanceof Error ? error : new Error("Could not fetch that.");
  }
}
