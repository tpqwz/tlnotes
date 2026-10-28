import { useEffect, useState } from "react";
import { graphSummary, queryGraph, type GraphQuery } from "@/lib/tl/graph";
import type { Note } from "@/lib/tl/model";
import { btnSurface } from "@/components/tl/ui";

const TRIALS = [
  "select kind, count(*) as n from node group by kind order by n desc",
  "select n.title, e.rel, coalesce(d.title, e.dst) as target from edge e join node n on n.id = e.src left join node d on d.id = e.dst",
  "select property, value, source from statement order by property",
];

export function GraphPanel({ notes }: { notes: Note[] }) {
  const [summary, setSummary] = useState<{ nodes: number; edges: number; pages: number; links: GraphQuery } | null>(null);
  const [sql, setSql] = useState(TRIALS[0]);
  const [result, setResult] = useState<GraphQuery | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    void graphSummary(notes)
      .then((next) => {
        if (!cancel) {
          setSummary(next);
          setError("");
        }
      })
      .catch((caught) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "The graph did not open.");
      });
    return () => {
      cancel = true;
    };
  }, [notes]);

  async function run(text: string) {
    setSql(text);
    setResult(await queryGraph(notes, text));
  }

  return (
    <div>
      <p className="text-sm text-pretty text-muted">
        SQLite, rebuilt from the journal whenever it changes. The notes stay in their own store. This is only the graph:
        pages, titles, and the MyST links between them.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-primary">{error}</p>
      ) : summary ? (
        <p className="mt-3 text-sm text-muted tabular-nums">
          {summary.nodes} notes · {summary.pages} pages · {summary.edges} relations
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">Opening the graph…</p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {TRIALS.map((trial) => (
          <button key={trial} type="button" className={`${btnSurface} justify-start text-left`} onClick={() => void run(trial)}>
            <span className="truncate font-mono text-xs">{trial}</span>
          </button>
        ))}
      </div>
      <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-fg">
        Select
        <textarea className="field font-mono text-sm" value={sql} onChange={(event) => setSql(event.target.value)} />
      </label>
      <button type="button" className={`${btnSurface} mt-2`} onClick={() => void run(sql)}>
        Run
      </button>
      {result && "error" in result && <p className="mt-3 text-sm text-primary">{result.error}</p>}
      {result && "columns" in result && result.columns.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {result.columns.map((column) => (
                  <th key={column} className="border-b border-border px-2 py-1 font-medium text-muted">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b border-border px-2 py-1 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
