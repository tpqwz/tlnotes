import { previewPathPrefix } from "@/lib/preview-path-prefix";
import { toast } from "sonner";

export const BUILD_ID = "0";

export type PwaUpdate = "idle" | "checking" | "ready" | "current" | "unsupported" | "unconfirmed";

export type PwaSnapshot = {
  installed: boolean;
  canInstall: boolean;
  iosHint: boolean;
  update: PwaUpdate;
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const empty: PwaSnapshot = { installed: false, canInstall: false, iosHint: false, update: "idle" };

let snapshot: PwaSnapshot = empty;
let promptEvent: InstallPrompt | null = null;
let registration: ServiceWorkerRegistration | null = null;
let applying = false;
let allowReload = false;
const listeners = new Set<() => void>();

function emit(next: PwaSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getPwaSnapshot() {
  return snapshot;
}

export function subscribePwa(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function installedNow() {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return ["standalone", "fullscreen", "window-controls-overlay"].some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

function iosNow() {
  const nav = navigator as Navigator & { platform?: string };
  const pad = nav.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || pad;
}

function publish(update: PwaUpdate = snapshot.update) {
  emit({
    installed: installedNow(),
    canInstall: promptEvent != null && !installedNow(),
    iosHint: iosNow() && !installedNow() && promptEvent == null,
    update,
  });
}

function markReady() {
  publish("ready");
  try {
    if (sessionStorage.getItem("tlnotes.update-quiet") === "1") return;
    sessionStorage.setItem("tlnotes.update-quiet", "1");
  } catch {
    /* still show the notice once */
  }
  toast("An update is ready. It waits in Settings, so you can export a copy first.", {
    id: "tlnotes-update",
    duration: 12000,
    closeButton: true,
  });
}

export async function applyUpdate() {
  toast.dismiss("tlnotes-update");
  try {
    sessionStorage.removeItem("tlnotes.update-quiet");
  } catch {
    /* the reload still applies */
  }
  allowReload = true;
  applying = true;
  const controller = navigator.serviceWorker.controller;
  if (controller) {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      const done = () => resolve();
      channel.port1.onmessage = done;
      controller.postMessage({ type: "refresh-shell" }, [channel.port2]);
      window.setTimeout(done, 1500);
    });
  }
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: "skip-waiting" });
  else window.location.reload();
}

function readStamp(body: string) {
  const text = body.trim();
  if (/^[0-9a-z]+(?:-[0-9a-z]+)?$/i.test(text)) return text;
  const meta = text.match(/<meta[^>]*name=["']tlnotes-build["'][^>]*>/i)?.[0] ?? "";
  const content = meta.match(/content=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
  return /^[0-9a-z]+(?:-[0-9a-z]+)?$/i.test(content) ? content : "";
}

function within(ms: number) {
  const control = new AbortController();
  const timer = window.setTimeout(() => control.abort(), ms);
  return { signal: control.signal, done: () => window.clearTimeout(timer) };
}

async function publishedStamp() {
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  const probes = [`${prefix}/__tlnotes/stamp`, `${prefix}/__tlnotes/build`, `${prefix}/`];
  for (const probe of probes) {
    const limit = within(8000);
    try {
      const response = await fetch(`${probe}${probe.includes("?") ? "&" : "?"}v=${Date.now()}`, { signal: limit.signal });
      if (!response.ok) continue;
      const stamp = readStamp(await response.text());
      if (stamp) return stamp;
    } catch {
      /* the next probe, or an honest miss */
    } finally {
      limit.done();
    }
  }
  return "";
}

export async function checkForUpdate(quiet = false) {
  if (!quiet) publish("checking");
  try {
    if (registration) {
      const limit = within(4000);
      await Promise.race([
        registration.update(),
        new Promise((_, reject) => {
          limit.signal.addEventListener("abort", () => reject(new Error("update timed out")), { once: true });
        }),
      ]);
      limit.done();
    }
  } catch {
    /* the published stamp is checked next */
  }
  const dev = import.meta.env.DEV;
  if (!dev && registration?.waiting && navigator.serviceWorker.controller) {
    markReady();
    return;
  }
  try {
    const remote = await publishedStamp();
    if (remote && remote !== BUILD_ID) markReady();
    else if (remote) publish("current");
    else if (!quiet && snapshot.update !== "ready") publish("unconfirmed");
  } catch {
    if (!quiet && snapshot.update !== "ready") publish("unconfirmed");
  }
}

export async function promptInstall() {
  if (!promptEvent) return;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  promptEvent = null;
  publish(choice.outcome === "accepted" ? snapshot.update : snapshot.update);
}

function workerScript() {
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}/sw.js`;
}

function holdDevPage() {
  if (window.parent !== window || !import.meta.hot) return;
  const flag = window as Window & { __tlnotesHold?: boolean };
  if (flag.__tlnotesHold) return;
  flag.__tlnotesHold = true;
  const proto = Location.prototype as unknown as { reload: (...args: unknown[]) => void };
  const original = proto.reload;
  proto.reload = function (...args: unknown[]) {
    if (allowReload) return original.apply(this, args);
    markReady();
  };
  import.meta.hot.on("vite:beforeUpdate", (payload: { updates?: unknown[] }) => {
    if (payload.updates) payload.updates.length = 0;
    markReady();
  });
  import.meta.hot.on("vite:beforeFullReload", () => {
    markReady();
  });
}

let started = false;

export function startPwa() {
  if (started) return;
  started = true;
  holdDevPage();
  try {
    localStorage.removeItem("tlnotes.installed");
  } catch {
    /* nothing remembered */
  }
  if (!("serviceWorker" in navigator)) {
    emit({ ...empty, update: "unsupported" });
    return;
  }
  publish("idle");
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (installedNow()) return;
    promptEvent = event as InstallPrompt;
    publish();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    publish();
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!applying) return;
    allowReload = true;
    window.location.reload();
  });
  void navigator.serviceWorker.register(workerScript()).then((reg) => {
    registration = reg;
    if (!import.meta.env.DEV && reg.waiting && navigator.serviceWorker.controller) markReady();
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (import.meta.env.DEV) return;
        if (worker.state === "installed" && navigator.serviceWorker.controller) markReady();
        else if (worker.state === "redundant" && snapshot.update !== "ready") publish("idle");
      });
    });
  }).catch(() => {
    registration = null;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") publish();
    if (document.visibilityState === "visible" && snapshot.update !== "ready" && snapshot.update !== "checking") {
      void checkForUpdate(true);
    }
  });
  for (const mode of ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]) {
    window.matchMedia(`(display-mode: ${mode})`).addEventListener("change", () => publish());
  }
}
