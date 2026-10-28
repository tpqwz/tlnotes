import type { Note } from "@/lib/tl/model";
import { searchText } from "@/lib/tl/search";

export type SearchModel = "off" | "e5" | "gemma";

export type EmbedStatus = {
  model: SearchModel;
  state: "idle" | "loading" | "ready" | "error";
  detail: string;
  indexed: number;
  total: number;
};

const MODELS = {
  e5: "Xenova/multilingual-e5-small",
  gemma: "onnx-community/embeddinggemma-300m-ONNX",
} as const;

const LIBRARY = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

type Vector = Float32Array;

let status: EmbedStatus = { model: "off", state: "idle", detail: "", indexed: 0, total: 0 };
const listeners = new Set<() => void>();
let loader: Promise<void> | null = null;
let embedder: ((text: string) => Promise<Vector>) | null = null;
let loaded: SearchModel = "off";
let queue: Note[] = [];
let pumping = false;
const memory = new Map<string, Vector>();

function publish(partial: Partial<EmbedStatus>) {
  status = { ...status, ...partial };
  for (const listener of listeners) listener();
}

export function subscribeEmbed(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function embedStatus() {
  return status;
}

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16);
}

function keyOf(model: SearchModel, note: Note, text: string) {
  return `${model}\0${note.id}\0${hash(text)}`;
}

function openStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("tlnotes-search", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("vec");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readVector(key: string) {
  const known = memory.get(key);
  if (known) return known;
  const database = await openStore();
  const vector = await new Promise<Vector | null>((resolve, reject) => {
    const request = database.transaction("vec").objectStore("vec").get(key);
    request.onsuccess = () => {
      const value = request.result;
      resolve(value instanceof Float32Array ? value : null);
    };
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (vector) memory.set(key, vector);
  return vector;
}

async function writeVector(key: string, vector: Vector) {
  memory.set(key, vector);
  const database = await openStore();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction("vec", "readwrite").objectStore("vec").put(vector, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}

function unit(vector: Vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!norm) return vector;
  const next = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) next[index] = vector[index] / norm;
  return next;
}

async function load(model: Exclude<SearchModel, "off">) {
  const mine = generation;
  publish({ model, state: "loading", detail: "Fetching the model…" });
  const imported = (await import(/* @vite-ignore */ LIBRARY)) as {
    pipeline?: (task: string, id: string, options: Record<string, unknown>) => Promise<(text: string, options: Record<string, unknown>) => Promise<{ data: Float32Array }>>;
    AutoTokenizer: { from_pretrained: (id: string, options: Record<string, unknown>) => Promise<(text: string, options: Record<string, unknown>) => Promise<unknown>> };
    AutoModel: { from_pretrained: (id: string, options: Record<string, unknown>) => Promise<(inputs: unknown) => Promise<{ sentence_embedding: { data: Float32Array; dims: number[] } }>> };
    env: { allowLocalModels: boolean; useBrowserCache: boolean };
  };
  imported.env.allowLocalModels = false;
  imported.env.useBrowserCache = true;
  const progress_callback = (update: { status?: string; progress?: number; file?: string }) => {
    if (typeof update.progress === "number") publish({ detail: `Downloading ${Math.round(update.progress)}%` });
    else if (update.status) publish({ detail: update.status });
  };
  if (model === "e5") {
    if (!imported.pipeline) throw new Error("The embedding library did not load.");
    const extractor = await imported.pipeline("feature-extraction", MODELS.e5, { device: "wasm", dtype: "q8", progress_callback });
    if (mine !== generation) return;
    embedder = async (text) => unit((await extractor(text, { pooling: "mean", normalize: true })).data);
  } else {
    const tokenizer = await imported.AutoTokenizer.from_pretrained(MODELS.gemma, { progress_callback });
    const weights = await imported.AutoModel.from_pretrained(MODELS.gemma, { device: "wasm", dtype: "q4", progress_callback });
    if (mine !== generation) return;
    embedder = async (text) => {
      const inputs = await tokenizer(text, { padding: true, truncation: true });
      const { sentence_embedding: embedding } = await weights(inputs);
      const width = embedding.dims.at(-1) ?? embedding.data.length;
      return unit(embedding.data.slice(0, width));
    };
  }
  if (mine !== generation) return;
  loaded = model;
  publish({ model, state: "ready", detail: "Ready" });
}

let generation = 0;

export function chooseModel(model: SearchModel) {
  const mine = ++generation;
  if (model === loaded && (model === "off" || status.state === "ready")) {
    publish({ model });
    return;
  }
  embedder = null;
  loaded = "off";
  loader = null;
  if (model === "off") {
    publish({ model: "off", state: "idle", detail: "", indexed: 0, total: 0 });
    return;
  }
  loader = load(model).then(() => {
    if (mine !== generation) return;
  }).catch((caught: unknown) => {
    if (mine !== generation) return;
    embedder = null;
    loaded = "off";
    publish({
      model,
      state: "error",
      detail: caught instanceof Error ? caught.message : "The model did not load.",
    });
  });
}

function passage(model: SearchModel, note: Note) {
  const text = searchText(note).slice(0, 1500);
  if (model === "e5") return `passage: ${text}`;
  const title = note.labels?.[0]?.text || note.content.split("\n")[0]?.trim() || "none";
  return `title: ${title} | text: ${text}`;
}

function question(model: SearchModel, query: string) {
  if (model === "e5") return `query: ${query}`;
  return `task: search result | query: ${query}`;
}

let busy = false;

async function pump() {
  if (pumping || busy) return;
  pumping = true;
  try {
    while (queue.length > 0 && embedder && loaded !== "off" && !busy) {
      const note = queue.shift();
      if (!note) break;
      const model = loaded;
      const text = passage(model, note);
      const key = keyOf(model, note, text);
      const cached = await readVector(key).catch(() => null);
      if (!cached && embedder) {
        busy = true;
        try {
          const vector = await embedder(text);
          await writeVector(key, vector).catch(() => undefined);
        } finally {
          busy = false;
        }
      }
      publish({ indexed: status.indexed + 1 });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  } finally {
    pumping = false;
  }
}

export function watchNotes(notes: Note[]) {
  if (status.model === "off") return;
  queue = [...notes];
  publish({ total: notes.length, indexed: 0 });
  void pump();
}

function cosine(left: Vector, right: Vector) {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) sum += left[index] * right[index];
  return sum;
}

export async function scoreMeaning(notes: Note[], query: string) {
  if (loader) await loader;
  const model = loaded;
  if (!embedder || model === "off") return new Map<string, number>();
  while (busy) await new Promise((resolve) => window.setTimeout(resolve, 30));
  busy = true;
  let asked: Vector;
  try {
    asked = await embedder(question(model, query));
  } finally {
    busy = false;
    void pump();
  }
  const scores = new Map<string, number>();
  for (const note of notes) {
    const vector = await readVector(keyOf(model, note, passage(model, note))).catch(() => null);
    if (vector) scores.set(note.id, cosine(asked, vector));
  }
  return scores;
}
