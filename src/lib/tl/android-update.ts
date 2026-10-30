export const PAGE_ORIGIN = "https://tpqwz.github.io/tlnotes/";
const PAGE_MANIFEST = new URL("android.json", PAGE_ORIGIN).href;

/** A published stamp is newer when its time is later. Dev copies use "0". */
export function androidBuildIsNewer(local: string, remote: string) {
  const left = Number.parseInt(local, 36);
  const right = Number.parseInt(remote, 36);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return right > left;
}

export async function checkPagePackage(): Promise<{ state: "newer" | "current" | "unconfirmed"; url: string }> {
  try {
    const { BUILD_ID } = await import("@/lib/tl/pwa");
    const { CapacitorHttp } = await import("@capacitor/core");
    const response = await CapacitorHttp.get({ url: PAGE_MANIFEST, responseType: "json" });
    const data = response.data as { build?: string; apk?: string };
    const build = typeof data?.build === "string" ? data.build.trim() : "";
    const apk = typeof data?.apk === "string" ? data.apk.trim() : "";
    if (!build || !apk) return { state: "unconfirmed", url: "" };
    const url = new URL(apk, PAGE_ORIGIN).href;
    if (!url.startsWith(PAGE_ORIGIN)) return { state: "unconfirmed", url: "" };
    return { state: androidBuildIsNewer(BUILD_ID, build) ? "newer" : "current", url };
  } catch {
    return { state: "unconfirmed", url: "" };
  }
}
