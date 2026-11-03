import { registerPlugin } from "@capacitor/core";

type NativeSyncFile = {
  pick(options: { create: boolean }): Promise<{ name?: string }>;
  read(): Promise<{ text?: string }>;
  write(options: { text: string }): Promise<void>;
  save(options: { filename: string; text: string; type: string }): Promise<{ name?: string; cancelled?: boolean }>;
  status(): Promise<{ name?: string }>;
  forget(): Promise<void>;
};

export const NativeSync = registerPlugin<NativeSyncFile>("SyncFile");

/** A Capacitor shell (Android, iOS, or a later desktop build). A browser tab and a PWA are not this. */
export function nativeApp() {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/** The browser tab and the installed site choose separately. Bytes stay if either one allows pictures. */
let picturesChosen = false;
let picturesKept = false;

export function siteInstalled() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return ["standalone", "fullscreen", "window-controls-overlay"].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
}

export function notePictures(browser: boolean, site: boolean) {
  picturesKept = browser || site;
  picturesChosen = siteInstalled() ? site : browser;
}

export function keepsFiles() {
  return nativeApp() || picturesChosen;
}

export function keepsPictureBytes() {
  return nativeApp() || picturesKept;
}

/** Platforms whose shell can keep a file open. iOS and desktop join this when they have the same plugin. */
const SYNC_PLATFORMS = new Set(["android", "ios"]);

export function nativeSync() {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (cap?.isNativePlatform?.() !== true) return false;
  return SYNC_PLATFORMS.has(cap.getPlatform?.() ?? "");
}

export function nativeAndroid() {
  return nativeSync() && (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === "android";
}
