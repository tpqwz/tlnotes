import { parseImport, type Note } from "@/lib/tl/model";
import { canonicalNotes, journalFingerprint, journalWriteIsSafe } from "@/lib/tl/journal";
import type { Settings } from "@/lib/tl/storage";

const DB_NAME = "tlnotes";
const DB_VERSION = 1;

type Removed = Record<string, number>;

export type Wrapped = { iv: string; ct: string };

export type SealedRecord = { id: string; sealed: true; iv: string; ct: string };

export type VaultRecord = {
  v: 1;
  kdf: { salt: string; iterations: number };
  passphrase: Wrapped;
  recovery: Wrapped;
  passkey: { id: string; salt: string; wrapped: Wrapped } | null;
};

export type JournalRecord = {
  notes: Note[];
  trash: Note[];
  sealed: SealedRecord[];
  vault: VaultRecord | null;
  settings: Settings | null;
  ready: boolean;
  removed: Removed;
};

function request<T>(done: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    done.onsuccess = () => resolve(done.result);
    done.onerror = () => reject(done.error ?? new Error("IndexedDB request failed"));
  });
}

let opening: Promise<IDBDatabase> | null = null;

export function openJournalDb() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IndexedDB did not open")), 15000);
    let asked: IDBOpenDBRequest;
    try {
      asked = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error("IndexedDB is unavailable"));
      return;
    }
    asked.onupgradeneeded = () => {
      const db = asked.result;
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    asked.onsuccess = () => {
      clearTimeout(timer);
      const db = asked.result;
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    asked.onerror = () => {
      clearTimeout(timer);
      reject(asked.error ?? new Error("IndexedDB did not open"));
    };
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

function transaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    run(tx).then(
      (value) => {
        result = value;
      },
      (error) => {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(error instanceof Error ? error : new Error("IndexedDB transaction failed"));
      },
    );
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function split(records: Note[]) {
  return parseImport({ notes: records, trash: [] }) ?? { notes: [], trash: [] };
}

function isSealed(value: unknown): value is SealedRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as SealedRecord;
  return record.sealed === true && typeof record.id === "string" && typeof record.iv === "string" && typeof record.ct === "string";
}

export async function readJournal(): Promise<JournalRecord> {
  const db = await openJournalDb();
  return transaction(db, ["notes", "meta"], "readonly", async (tx) => {
    const notesStore = tx.objectStore("notes");
    const meta = tx.objectStore("meta");
    const records = (await request(notesStore.getAll())) as unknown[];
    const settingsRaw = (await request(meta.get("settings"))) as Settings | undefined;
    const ready = (await request(meta.get("ready"))) === true;
    const removed = ((await request(meta.get("removed"))) as Removed | undefined) ?? {};
    const vault = ((await request(meta.get("vault"))) as VaultRecord | undefined) ?? null;
    const sealed = records.filter(isSealed);
    const { notes, trash } = split(records.filter((item) => !isSealed(item)) as Note[]);
    return {
      notes,
      trash,
      sealed,
      vault,
      settings: settingsRaw ?? null,
      ready,
      removed,
    };
  });
}

function storedNote(note: Note, trashed: boolean): Note {
  if (!trashed) {
    const copy = { ...note };
    delete copy.trashedAt;
    return copy;
  }
  return note.trashedAt ? note : { ...note, trashedAt: note.edited };
}

export async function writeRecords(
  records: { id: string }[],
  settings: Settings,
  previousRemoved: Removed,
  ready = true,
  replace = false,
) {
  const db = await openJournalDb();
  const removed: Removed = { ...previousRemoved };
  await transaction(db, ["notes", "meta"], "readwrite", async (tx) => {
    const notesStore = tx.objectStore("notes");
    const meta = tx.objectStore("meta");
    const stored = (await request(notesStore.getAll())) as { id: string }[];
    const prior = new Map(stored.map((item) => [item.id, JSON.stringify(item)]));
    const keep = new Set(records.map((record) => record.id));
    if (!journalWriteIsSafe([...prior.keys()], [...keep], replace)) {
      throw new Error("The open journal does not match the stored one, so this change was not written.");
    }
    for (const record of records) {
      delete removed[record.id];
      if (prior.get(record.id) === JSON.stringify(record)) continue;
      await request(notesStore.put(record));
    }
    const now = Date.now();
    for (const id of prior.keys()) {
      if (keep.has(id)) continue;
      removed[id] = now;
      await request(notesStore.delete(id));
    }
    await request(meta.put(settings, "settings"));
    await request(meta.put(removed, "removed"));
    await request(meta.put(ready, "ready"));
  });
  return removed;
}

export async function writeJournal(
  notes: Note[],
  trash: Note[],
  settings: Settings,
  previousRemoved: Removed,
  ready = true,
  replace = false,
) {
  const records = [...notes.map((note) => storedNote(note, false)), ...trash.map((note) => storedNote(note, true))];
  try {
    return await writeRecords(records, settings, previousRemoved, ready, replace);
  } catch (error) {
    if (!storageFull(error)) throw error;
    await dropSearchCache();
    return writeRecords(records, settings, previousRemoved, ready, replace);
  }
}

export async function writeVault(vault: VaultRecord | null) {
  const db = await openJournalDb();
  await transaction(db, ["meta"], "readwrite", async (tx) => {
    const meta = tx.objectStore("meta");
    if (vault) await request(meta.put(vault, "vault"));
    else await request(meta.delete("vault"));
  });
}

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const db = await openJournalDb();
  return transaction(db, ["meta"], "readonly", async (tx) => {
    const value = await request(tx.objectStore("meta").get(key));
    return (value as T | undefined) ?? undefined;
  });
}

export async function writeMeta(key: string, value: unknown) {
  const db = await openJournalDb();
  await transaction(db, ["meta"], "readwrite", async (tx) => {
    await request(tx.objectStore("meta").put(value, key));
  });
}

export async function deleteMeta(key: string) {
  const db = await openJournalDb();
  await transaction(db, ["meta"], "readwrite", async (tx) => {
    await request(tx.objectStore("meta").delete(key));
  });
}

function storageFull(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError" || name === "QuotaExceeded") return true;
  const message = "message" in error ? String(error.message) : "";
  return /quota/i.test(message);
}

function dropSearchCache() {
  return new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase("tlnotes-search");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function putSettings(settings: Settings) {
  const db = await openJournalDb();
  await transaction(db, ["meta"], "readwrite", async (tx) => {
    await request(tx.objectStore("meta").put(settings, "settings"));
  });
}

export async function writeSettings(settings: Settings) {
  try {
    await putSettings(settings);
  } catch (error) {
    if (!storageFull(error)) throw error;
    await dropSearchCache();
    await putSettings(settings);
  }
}

export async function journalMatches(notes: Note[], trash: Note[]) {
  const back = await readJournal();
  const wanted = journalFingerprint(canonicalNotes(notes, trash));
  const found = journalFingerprint([...back.notes, ...back.trash]);
  return wanted === found;
}
