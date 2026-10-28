import { useState } from "react";
import { importAddress, importEntity, importOneLook, importSphere, importWord } from "@/lib/tl/import-entity";
import type { Note } from "@/lib/tl/model";
import { btnPrimary, btnSurface } from "@/components/tl/ui";
import { t } from "@/lib/tl/i18n";

const GROUPS = [
  {
    label: "A word",
    sources: [
      { id: "onelook", label: "OneLook" },
      { id: "word", label: "Wiktionary" },
    ],
  },
  {
    label: "A page",
    sources: [
      { id: "encyclopedia", label: "Wikipedia" },
      { id: "encyclosearch", label: "Encyclo" },
      { id: "oldpedia", label: "Oldpedia" },
      { id: "wikidata", label: "Wikidata" },
      { id: "address", label: "Address" },
    ],
  },
] as const;

type SourceId = (typeof GROUPS)[number]["sources"][number]["id"];

export function ImportPanel({ onBring }: { onBring: (note: Note) => void }) {
  const [kind, setKind] = useState<SourceId>("onelook");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function bring() {
    setBusy(true);
    setError("");
    try {
      const note =
        kind === "onelook"
          ? await importOneLook(query)
          : kind === "word"
            ? await importWord(query)
            : kind === "address"
              ? await importAddress(query)
              : kind === "encyclosearch" || kind === "oldpedia"
                ? await importSphere(query, kind)
                : await importEntity(query, kind);
      onBring(note);
      setQuery("");
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t("That did not come in."));
    } finally {
      setBusy(false);
    }
  }

  const placeholder =
    kind === "address" ? t("A wiki address") : kind === "onelook" || kind === "word" ? t("A word") : kind === "wikidata" ? t("A name, or Q42") : t("A name");

  return (
    <div>
      {GROUPS.map((group) => (
        <div key={group.label} className="mt-3 first:mt-0">
          <p className="text-sm text-muted">{t(group.label)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.sources.map((source) => (
              <button
                key={source.id}
                type="button"
                aria-pressed={kind === source.id}
                className={kind === source.id ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
                onClick={() => setKind(source.id)}
              >
                {source.id === "address" ? t(source.label) : source.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-3 flex gap-2">
        <input
          className="field"
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void bring();
          }}
        />
        <button type="button" className={btnPrimary} disabled={busy || query.trim() === ""} onClick={() => void bring()}>
          {busy ? t("Reading…") : t("Bring in")}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-pretty text-primary">{error}</p>}
    </div>
  );
}