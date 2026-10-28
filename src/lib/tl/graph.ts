import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { mystRefs } from "@/lib/tl/myst";
import type { Note } from "@/lib/tl/model";

export type GraphQuery = { columns: string[]; rows: string[][] } | { error: string };

let engine: Promise<{ Database: new () => Database }> | null = null;
let database: Database | null = null;
let builtFor = "";

function sqlEngine() {
  engine ??= initSqlJs({ locateFile: () => wasmUrl });
  return engine;
}

function labelName(label: { text: string } | string) {
  return typeof label === "string" ? label : label.text;
}

function titleOf(note: Note) {
  return labelName(note.labels?.[0] ?? "") || note.content.split("\n")[0]?.trim() || note.type;
}

function rebuild(db: Database, notes: Note[]) {
  db.run("CREATE TABLE node (id TEXT PRIMARY KEY, kind TEXT, title TEXT)");
  db.run("CREATE TABLE label (id TEXT, label TEXT)");
  db.run("CREATE TABLE edge (src TEXT, dst TEXT, rel TEXT)");
  db.run("CREATE TABLE statement (id TEXT, property TEXT, value TEXT, source TEXT)");
  const byLabel = new Map<string, string>();
  for (const note of notes) {
    db.run("INSERT INTO node (id, kind, title) VALUES (?, ?, ?)", [note.id, note.type, titleOf(note)]);
    const names = [titleOf(note), ...(note.labels ?? []).map(labelName)];
    for (const name of names) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      db.run("INSERT INTO label (id, label) VALUES (?, ?)", [note.id, name.trim()]);
      if (!byLabel.has(key)) byLabel.set(key, note.id);
    }
    byLabel.set(note.id.toLowerCase(), note.id);
    for (const item of note.statements ?? []) {
      db.run("INSERT INTO statement (id, property, value, source) VALUES (?, ?, ?, ?)", [
        note.id,
        item.property,
        item.value,
        item.source,
      ]);
    }
  }
  for (const note of notes) {
    const refs = note.type === "page" || note.type === "headword" ? mystRefs(note.content) : [];
    for (const ref of refs) {
      const dst = byLabel.get(ref.target.trim().toLowerCase()) ?? ref.target.trim();
      if (!dst || dst === note.id) continue;
      db.run("INSERT INTO edge (src, dst, rel) VALUES (?, ?, ?)", [note.id, dst, ref.rel]);
    }
    for (const item of note.statements ?? []) {
      const dst = byLabel.get(item.value.trim().toLowerCase());
      if (!dst || dst === note.id) continue;
      db.run("INSERT INTO edge (src, dst, rel) VALUES (?, ?, ?)", [note.id, dst, item.property]);
    }
    if (note.attachedTo && note.attachedTo !== note.id) {
      db.run("INSERT INTO edge (src, dst, rel) VALUES (?, ?, ?)", [note.id, note.attachedTo, "on"]);
    }
    if (note.parentId && note.parentId !== note.id) {
      db.run("INSERT INTO edge (src, dst, rel) VALUES (?, ?, ?)", [note.id, note.parentId, "under"]);
    }
    for (const [rel, names] of [
      ["author", note.book?.authors ?? []],
      ["translator", note.book?.translators ?? []],
      ["subject", note.book?.subjects ?? []],
    ] as const) {
      for (const name of names) {
        const dst = byLabel.get(name.trim().toLowerCase());
        if (!dst || dst === note.id) continue;
        db.run("INSERT INTO edge (src, dst, rel) VALUES (?, ?, ?)", [note.id, dst, rel]);
      }
    }
  }
}

export async function withGraph(notes: Note[]) {
  const stamp = notes.map((note) => `${note.id}:${note.edited}:${note.type}`).join("|");
  const { Database } = await sqlEngine();
  if (!database || builtFor !== stamp) {
    database?.close();
    database = new Database();
    rebuild(database, notes);
    builtFor = stamp;
  }
  return database;
}

export async function queryGraph(notes: Note[], source: string): Promise<GraphQuery> {
  const text = source.trim().replace(/;+\s*$/, "");
  if (!text) return { error: "Write a select." };
  if (!/^select\b/i.test(text) || text.includes(";")) return { error: "Only a single select is run here." };
  try {
    const db = await withGraph(notes);
    const result = db.exec(text);
    const table = result[0];
    if (!table) return { columns: [], rows: [] };
    return {
      columns: table.columns,
      rows: table.values.slice(0, 40).map((row) => row.map((cell) => (cell == null ? "" : String(cell)))),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The query did not run." };
  }
}

export async function graphSummary(notes: Note[]) {
  const count = async (sql: string) => {
    const result = await queryGraph(notes, sql);
    if ("error" in result) return 0;
    return Number(result.rows[0]?.[0] ?? 0);
  };
  const [nodes, edges, pages] = await Promise.all([
    count("select count(*) from node"),
    count("select count(*) from edge"),
    count("select count(*) from node where kind = 'page'"),
  ]);
  const links = await queryGraph(
    notes,
    "select n.title, e.rel, coalesce(d.title, e.dst) from edge e join node n on n.id = e.src left join node d on d.id = e.dst order by n.title",
  );
  return { nodes, edges, pages, links };
}
