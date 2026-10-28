import { citedQuotation, tidyUrl, type Note } from "@/lib/tl/model";

const INBOX = "tlnotes.inbox";
const SHARE_CACHE = "tlnotes-share";
const SHARE_PATH = "/__tlnotes/share-payload";
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;

export type SharePayload = {
  title: string;
  text: string;
  url: string;
};

export async function shareQuotation(note: Note): Promise<"shared" | "copied" | "dismissed"> {
  const text = citedQuotation(note);
  const author = note.sources?.find((source) => source.author.trim())?.author.trim();
  const title = author || "Quotation";
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "dismissed";
    }
  }
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("Could not share that quotation.");
  await navigator.clipboard.writeText(text);
  return "copied";
}

export function onAndroid() {
  if (typeof navigator === "undefined") return false;
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  if (cap?.getPlatform?.() === "android") return true;
  return /Android/i.test(navigator.userAgent);
}

/** A phone or tablet, including a mobile browser and an installed page. */
export function onMobile() {
  if (typeof navigator === "undefined") return false;
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  if (platform === "android" || platform === "ios") return true;
  const agent = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (agent.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(hover: none)").matches;
}

export async function shareLink(url: string): Promise<"shared" | "copied" | "dismissed"> {
  if (onAndroid() && typeof navigator.share === "function") {
    try {
      await navigator.share({ url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "dismissed";
      throw error;
    }
  }
  let copied = false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return copied ? "copied" : "dismissed";
    }
  }
  if (!copied) throw new Error("Could not copy that link.");
  return "copied";
}

export function takeInbox(): SharePayload | null {
  let stored: Partial<SharePayload> | null = null;
  try {
    const raw = localStorage.getItem(INBOX);
    localStorage.removeItem(INBOX);
    if (raw) stored = JSON.parse(raw) as Partial<SharePayload>;
  } catch {
    stored = null;
  }

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.has("title") || params.has("text") || params.has("url");
  const title = String(stored?.title ?? params.get("title") ?? "").trim();
  const text = String(stored?.text ?? params.get("text") ?? "").trim();
  const url = String(stored?.url ?? params.get("url") ?? "").trim();
  if (fromQuery) {
    params.delete("title");
    params.delete("text");
    params.delete("url");
    params.delete("shared");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
  }
  if (!title && !text && !url) return null;
  return { title, text, url };
}

export async function pullShare(): Promise<SharePayload | null> {
  return takeInbox() ?? (await takeShareCache());
}

let incomingOnce: Promise<SharePayload | null> | null = null;

export function peekIncomingShare(): Promise<SharePayload | null> {
  incomingOnce ??= pullShare().then((found) => {
    if (!found) incomingOnce = null;
    return found;
  });
  return incomingOnce;
}

export function finishIncomingShare() {
  incomingOnce = null;
}

export function listenNativeShare(onShare: (payload: SharePayload) => void) {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return () => undefined;
  let stopped = false;
  let remove: (() => Promise<void>) | null = null;
  void import("@capgo/capacitor-share-target")
    .then(async ({ CapacitorShareTarget }) => {
      if (stopped) return;
      const handle = await CapacitorShareTarget.addListener("shareReceived", (event) => {
        const text = (event.texts ?? []).filter(Boolean).join("\n").trim();
        const title = event.title?.trim() ?? "";
        const found = text.match(URL_IN_TEXT)?.[0] ?? "";
        if (!title && !text) return;
        onShare({ title, text, url: found });
      });
      if (stopped) {
        void handle.remove();
        return;
      }
      remove = () => handle.remove();
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    void remove?.();
  };
}

let reading: Promise<SharePayload | null> | null = null;

async function takeShareCache(): Promise<SharePayload | null> {
  if (typeof caches === "undefined") return null;
  if (!reading) reading = readShareCache().finally(() => {
    reading = null;
  });
  return reading;
}

async function readShareCache(): Promise<SharePayload | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const key = new URL(SHARE_PATH, window.location.origin).href;
    const response = await cache.match(key);
    if (!response) return null;
    await cache.delete(key);
    const data = (await response.json()) as Partial<SharePayload>;
    const title = String(data.title ?? "").trim();
    const text = String(data.text ?? "").trim();
    const url = String(data.url ?? "").trim();
    if (!title && !text && !url) return null;
    if (window.location.search.includes("shared=")) {
      const params = new URLSearchParams(window.location.search);
      params.delete("shared");
      const rest = params.toString();
      window.history.replaceState(window.history.state, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }
    return { title, text, url };
  } catch {
    return null;
  }
}

function foundUrl(...values: string[]) {
  for (const value of values) {
    const match = value.match(URL_IN_TEXT);
    if (match?.[0]) return tidyUrl(match[0].replace(/[),.]+$/, ""));
  }
  return "";
}

function blank(content: string, type: string, url = ""): Note {
  const now = Date.now();
  const note: Note = {
    id: crypto.randomUUID(),
    type,
    content,
    tags: [],
    created: now,
    edited: now,
    date: null,
  };
  if (url) note.url = url;
  return note;
}

export function shareAsTyped(share: SharePayload): string {
  const title = share.title.trim();
  const text = share.text.trim();
  const url = tidyUrl(share.url);
  if (text && url && !text.includes(url)) {
    const line = title && title !== text && !text.startsWith(title) ? `${title}\n${text}` : text;
    return `${line}\n${url}`;
  }
  const body = text || url;
  if (!body) return title;
  if (title && title !== body && !body.startsWith(title)) return `${title}\n\n${body}`;
  return body;
}

export function noteFromShare(share: SharePayload): Note | null {
  const title = share.title.trim();
  const text = share.text.trim();
  const url = tidyUrl(share.url) || foundUrl(text, title);
  const textIsUrl = Boolean(url) && (text === share.url.trim() || text === url || tidyUrl(text) === url);
  if (url && (!text || textIsUrl)) {
    return blank(title && title !== url ? title : url, "link", url);
  }
  if (url && title && text && !textIsUrl) {
    return blank(`${title}\n\n${text}`, "link", url);
  }
  if (url && text) {
    return blank(title && title !== url ? `${title}\n\n${text}` : text, "link", url);
  }
  const content = [title, text].filter((part) => part && part !== url).join("\n\n");
  if (!content) return null;
  return blank(content, "draft");
}
