import { deleteMeta, readMeta, writeMeta } from "@/lib/tl/idb";
import { canonicalNotes, combineJournals, journalFingerprint, unionRemoved } from "@/lib/tl/journal";
import { parseImport, type Note } from "@/lib/tl/model";
import { NativeSync, nativeAndroid } from "@/lib/tl/native-sync";
import { isVaultOn } from "@/lib/tl/vault";

const HANDLE = "sync-file";
const DEVICE = "device";

type SyncFile = {
  v: 1;
  kind: "tlnotes-sync";
  device: string;
  written: number;
  removed: Record<string, number>;
  notes: Note[];
  trash: Note[];
};

export type SyncSnap = {
  supported: boolean;
  name: string;
  detail: string;
};

const idle = "No sync file yet.";
let snap: SyncSnap = { supported: true, name: "", detail: idle };
const listeners = new Set<() => void>();

function setSnap(next: SyncSnap) {
  if (next.supported === snap.supported && next.name === snap.name && next.detail === snap.detail) return;
  snap = next;
  for (const listener of listeners) listener();
}

export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function syncSnapshot() {
  return snap;
}

let notes: Note[] = [];
let trash: Note[] = [];
let removed: Record<string, number> = {};
let apply: ((notes: Note[], trash: Note[]) => void) | null = null;
let timer = 0;
let running = false;
let pending = false;
let hold = false;

export function rememberJournal(nextNotes: Note[], nextTrash: Note[], nextRemoved: Record<string, number>) {
  notes = nextNotes;
  trash = nextTrash;
  removed = nextRemoved;
  if (hold) {
    pending = true;
    return;
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void kick(), 800);
}

export function startSync(onApply: (notes: Note[], trash: Note[]) => void) {
  apply = onApply;
  const onShow = () => {
    if (document.visibilityState === "visible") void kick();
  };
  document.addEventListener("visibilitychange", onShow);
  const interval = window.setInterval(() => {
    if (document.visibilityState === "visible") void kick();
  }, 30000);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("tlnotes-sync");
    channel.onmessage = () => {
      void restoreName();
      void kick();
    };
  } catch {
    channel = null;
  }
  void restoreName();
  return () => {
    document.removeEventListener("visibilitychange", onShow);
    window.clearInterval(interval);
    window.clearTimeout(timer);
    channel?.close();
    apply = null;
  };
}

async function restoreName() {
  try {
    if (nativeAndroid()) {
      const status = await NativeSync.status();
      if (!status.name) return;
      setSnap({ supported: true, name: status.name, detail: `${status.name} is read and written with your notes.` });
      return;
    }
    const handle = await readMeta<FileSystemFileHandle>(HANDLE);
    if (!handle) return;
    setSnap({ supported: true, name: handle.name, detail: `${handle.name} is read and written with your notes.` });
  } catch {
    /* the journal may not be open yet */
  }
}

async function deviceId() {
  const existing = await readMeta<string>(DEVICE);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await writeMeta(DEVICE, id);
  return id;
}

async function permit(handle: FileSystemFileHandle) {
  const gate = handle as FileSystemFileHandle & { queryPermission?: (desc: { mode: "readwrite" }) => Promise<PermissionState> };
  if (typeof gate.queryPermission !== "function") return true;
  return (await gate.queryPermission({ mode: "readwrite" })) === "granted";
}

function kinds() {
  return [{ description: "TLNotes", accept: { "application/json": [".json"] } }];
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
};

function localPicker(): PickerWindow | null {
  if (typeof window === "undefined") return null;
  const picker = window as PickerWindow;
  if (typeof picker.showOpenFilePicker !== "function" || typeof picker.showSaveFilePicker !== "function") return null;
  return picker;
}

export function syncDoorMode(): "open" | "new" | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("tl-sync");
  if (value === "new" || value === "open") return value;
  return null;
}

function doorUrl(create: boolean) {
  const url = new URL(window.location.href);
  url.searchParams.set("tl-sync", create ? "new" : "open");
  return url.toString();
}

function announceSync() {
  try {
    const channel = new BroadcastChannel("tlnotes-sync");
    channel.postMessage("ready");
    channel.close();
  } catch {
    /* a browser without the channel still keeps the file in this window */
  }
  if (syncDoorMode()) window.close();
}

export async function chooseSyncFile(create: boolean) {
  if (nativeAndroid()) {
    try {
      const picked = await NativeSync.pick({ create });
      if (!picked?.name) return;
      setSnap({ supported: true, name: picked.name, detail: `${picked.name} is read and written with your notes.` });
      await kick();
    } catch {
      setSnap({ supported: true, name: snap.name, detail: "The sync file could not be opened." });
    }
    return;
  }
  const picker = localPicker();
  if (!picker) {
    if (syncDoorMode()) {
      setSnap({
        supported: true,
        name: snap.name,
        detail: "Chromium hides the file picker in a page that is inside another window, or that is not https. Open TLNotes in its own tab and choose the file there.",
      });
      return;
    }
    const child = window.open(doorUrl(create), "tlnotes-sync", "popup=yes,width=440,height=560");
    setSnap({
      supported: true,
      name: snap.name,
      detail: child
        ? "Choose the file in the window that just opened. This page can use it once that is done."
        : "A window was blocked. Allow it, or open TLNotes in its own tab and choose the file there.",
    });
    return;
  }
  const openPicker = picker.showOpenFilePicker;
  const savePicker = picker.showSaveFilePicker;
  if (!openPicker || !savePicker) return;
  try {
    const handle = create
      ? await savePicker({ id: "tlnotes", suggestedName: "tlnotes.json", types: kinds() })
      : (await openPicker({ id: "tlnotes", multiple: false, mode: "readwrite", types: kinds() }))[0];
    if (!handle) return;
    await writeMeta(HANDLE, handle);
    setSnap({ supported: true, name: handle.name, detail: `${handle.name} is read and written with your notes.` });
    await kick();
    announceSync();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    setSnap({ supported: true, name: snap.name, detail: "The sync file could not be opened." });
  }
}

export async function forgetSyncFile() {
  if (nativeAndroid()) await NativeSync.forget().catch(() => undefined);
  await deleteMeta(HANDLE);
  setSnap({ supported: true, name: "", detail: idle });
}

async function kick() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    do {
      pending = false;
      await once();
    } while (pending);
  } finally {
    running = false;
  }
}

function sameRemoved(left: Record<string, number>, right: Record<string, number>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (left[key] !== right[key]) return false;
  return true;
}

async function once() {
  const store = await openStore();
  if (!store) return;
  if (isVaultOn()) {
    setSnap({
      supported: true,
      name: store.name,
      detail: "A sealed journal is not written to the sync file. Unseal it on both devices to sync, then seal it again.",
    });
    return;
  }
  let raw = "";
  try {
    raw = await store.read();
  } catch {
    setSnap({ supported: true, name: store.name, detail: `Could not read ${store.name}.` });
    return;
  }
  let remote = emptyFile();
  if (raw.trim()) {
    const parsed = parseSync(raw);
    if (!parsed) {
      setSnap({ supported: true, name: store.name, detail: `${store.name} is not a TLNotes sync file, so it was left alone.` });
      return;
    }
    remote = parsed;
  }
  const localBody = canonicalNotes(notes, trash);
  const remoteBody = canonicalNotes(remote.notes, remote.trash);
  const gone = unionRemoved(removed, remote.removed);
  const combined = combineJournals(localBody, remoteBody, gone);
  const nextPrint = journalFingerprint(combined.notes);
  const localChanged = nextPrint !== journalFingerprint(localBody);
  const fileChanged = nextPrint !== journalFingerprint(remoteBody) || !sameRemoved(gone, remote.removed);
  if (fileChanged) {
    const again = await store.read().catch(() => null);
    if (again !== raw) {
      pending = true;
      return;
    }
    const split = splitBody(combined.notes);
    const payload: SyncFile = {
      v: 1,
      kind: "tlnotes-sync",
      device: await deviceId(),
      written: Date.now(),
      removed: gone,
      notes: split.notes,
      trash: split.trash,
    };
    try {
      await store.write(JSON.stringify(payload));
    } catch {
      setSnap({ supported: true, name: store.name, detail: `Could not write ${store.name}.` });
      return;
    }
  }
  if (localChanged && apply) {
    const split = splitBody(combined.notes);
    hold = true;
    apply(split.notes, split.trash);
    notes = split.notes;
    trash = split.trash;
    removed = gone;
    hold = false;
  }
  setSnap({ supported: true, name: store.name, detail: `${store.name} is read and written with your notes.` });
}

type SyncStore = {
  name: string;
  read: () => Promise<string>;
  write: (text: string) => Promise<void>;
};

async function openStore(): Promise<SyncStore | null> {
  if (nativeAndroid()) {
    const status = await NativeSync.status().catch(() => ({ name: "" }));
    if (!status.name) return null;
    return {
      name: status.name,
      read: async () => (await NativeSync.read()).text ?? "",
      write: async (text) => {
        await NativeSync.write({ text });
      },
    };
  }
  const handle = await readMeta<FileSystemFileHandle>(HANDLE).catch(() => undefined);
  if (!handle) return null;
  let allowed = false;
  try {
    allowed = await permit(handle);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    setSnap({ supported: true, name: handle.name, detail: `${handle.name} needs permission again. Choose it once more.` });
    return null;
  }
  return {
    name: handle.name,
    read: async () => (await handle.getFile()).text(),
    write: async (text) => {
      const writable = await handle.createWritable();
      await writable.write(new Blob([text], { type: "application/json" }));
      await writable.close();
    },
  };
}

function splitBody(body: Note[]) {
  return parseImport({ notes: body, trash: [] }) ?? { notes: body.filter((note) => !note.trashedAt), trash: body.filter((note) => note.trashedAt) };
}

function emptyFile(): SyncFile {
  return { v: 1, kind: "tlnotes-sync", device: "", written: 0, removed: {}, notes: [], trash: [] };
}

function parseSync(raw: string): SyncFile | null {
  try {
    const value = JSON.parse(raw) as Partial<SyncFile>;
    if (value.kind !== "tlnotes-sync" || !Array.isArray(value.notes) || !Array.isArray(value.trash)) return null;
    const parsed = parseImport({ notes: value.notes, trash: value.trash });
    if (!parsed) return null;
    const gone: Record<string, number> = {};
    if (value.removed && typeof value.removed === "object") {
      for (const [id, at] of Object.entries(value.removed)) {
        if (typeof at === "number" && Number.isFinite(at)) gone[id] = at;
      }
    }
    return {
      v: 1,
      kind: "tlnotes-sync",
      device: typeof value.device === "string" ? value.device : "",
      written: typeof value.written === "number" ? value.written : 0,
      removed: gone,
      notes: parsed.notes,
      trash: parsed.trash,
    };
  } catch {
    return null;
  }
}
