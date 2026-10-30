/** Prefer a modest thumbnail. A full file is not what a note should keep. */
export function smallImage(url: string) {
  if (!url) return "";
  let next = url.replace(/\/\d+px-/, "/160px-");
  try {
    const parsed = new URL(next);
    if (parsed.searchParams.has("width") || (parsed.hostname.includes("wikimedia.org") && parsed.pathname.includes("Special:FilePath"))) {
      parsed.searchParams.set("width", "160");
      next = parsed.href;
    }
  } catch {
    return next;
  }
  return next;
}
