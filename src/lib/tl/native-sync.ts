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

/** Picture, video, and sound files are kept only in the installed app. A browser copy keeps the words and the address. */
export function keepsFiles() {
  return nativeApp();
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
