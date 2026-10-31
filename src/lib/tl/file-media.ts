import type { Note } from "@/lib/tl/model";
import { keepsFiles } from "@/lib/tl/native-sync";

const PREFIX = "tlfile:";

export function isStoredFile(value?: string) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function extOf(dataUrl: string) {
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  if (dataUrl.startsWith("data:image/gif")) return "gif";
  if (dataUrl.startsWith("data:audio/webm") || dataUrl.startsWith("data:video/webm")) return "webm";
  if (dataUrl.startsWith("data:audio/")) return "m4a";
  if (dataUrl.startsWith("data:video/")) return "mp4";
  return "jpg";
}

function mimeOf(path: string) {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".m4a")) return "audio/mp4";
  if (path.endsWith(".mp4")) return "video/mp4";
  return "image/jpeg";
}

async function files() {
  const [{ Filesystem, Directory }, { Capacitor }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/core")]);
  return { Filesystem, Directory, Capacitor };
}

async function writeMedia(id: string, slot: string, dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return "";
  const path = `media/${id}-${slot}.${extOf(dataUrl)}`;
  try {
    const { Filesystem, Directory } = await files();
    await Filesystem.writeFile({ path, data: dataUrl.slice(comma + 1), directory: Directory.Data, recursive: true });
    return `${PREFIX}${path}`;
  } catch {
    return "";
  }
}

async function place(note: Note, slot: string, value: string | undefined, apply: (copy: Note, next: string) => void) {
  if (!value?.startsWith("data:")) return note;
  const next = await writeMedia(note.id, slot, value);
  const copy = { ...note };
  if (next) apply(copy, next);
  else apply(copy, "");
  return copy;
}

/** On the installed app, picture and video bytes go to a private file. The note keeps the path. */
export async function parkNote(note: Note): Promise<Note> {
  if (!keepsFiles()) return note;
  let next = await place(note, "image", note.image, (copy, value) => {
    if (value) copy.image = value;
    else delete copy.image;
  });
  next = await place(next, "clip", next.video, (copy, value) => {
    if (value) copy.video = value;
    else delete copy.video;
  });
  if (next.preview?.image?.startsWith("data:")) {
    const image = await writeMedia(next.id, "preview", next.preview.image);
    const preview = { ...next.preview };
    if (image) preview.image = image;
    else delete preview.image;
    next = { ...next, preview };
  }
  return next;
}

export async function parkNotes(notes: Note[]) {
  const parked: Note[] = [];
  for (const note of notes) parked.push(await parkNote(note));
  return parked;
}

/** A web view address for a stored file. Anything else is returned unchanged. */
export async function shownFile(value: string) {
  if (!isStoredFile(value)) return value;
  try {
    const { Filesystem, Directory, Capacitor } = await files();
    const { uri } = await Filesystem.getUri({ path: value.slice(PREFIX.length), directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return "";
  }
}

async function readBack(value: string | undefined) {
  if (!value || !isStoredFile(value)) return value;
  try {
    const { Filesystem, Directory } = await files();
    const path = value.slice(PREFIX.length);
    const file = await Filesystem.readFile({ path, directory: Directory.Data });
    const data = typeof file.data === "string" ? file.data : "";
    return data ? `data:${mimeOf(path)};base64,${data}` : value;
  } catch {
    return value;
  }
}

/** A backup carries the bytes, not a path that only this phone knows. */
export async function materializeNote(note: Note): Promise<Note> {
  if (!keepsFiles()) return note;
  const image = await readBack(note.image);
  const video = await readBack(note.video);
  const previewImage = await readBack(note.preview?.image);
  if (image === note.image && video === note.video && previewImage === note.preview?.image) return note;
  const copy = { ...note };
  if (image) copy.image = image;
  if (video) copy.video = video;
  if (copy.preview && previewImage) copy.preview = { ...copy.preview, image: previewImage };
  return copy;
}

export async function materializeNotes(notes: Note[]) {
  const next: Note[] = [];
  for (const note of notes) next.push(await materializeNote(note));
  return next;
}
