import { RotateCcw, X } from "lucide-react";
import { formatTrashed, typeLabel, type Note } from "@/lib/tl/model";
import { t } from "@/lib/tl/i18n";
import { blendNotes, rankNotes } from "@/lib/tl/search";
import { btnGhost } from "@/components/tl/ui";

export function TrashView({
  trash,
  query,
  stem,
  fuzzy,
  meaning,
  onBack,
  onRestore,
  onDelete,
}: {
  trash: Note[];
  query: string;
  stem: boolean;
  fuzzy: boolean;
  meaning: Map<string, number>;
  onBack: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const items = query.trim()
    ? blendNotes(trash, rankNotes(trash, query, { stem, fuzzy }), meaning)
    : [...trash].sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));

  return (
    <div className="pb-8">
      <button type="button" className={btnGhost} onClick={onBack}>
        {t("Back")}
      </button>
      {items.length === 0 ? (
        <p className="mt-8 text-center text-pretty text-muted">{t("Trash is empty.")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((note) => (
            <li key={note.id} className="rounded-xl bg-surface px-3 py-3 lift">
              <p className="text-pretty whitespace-pre-wrap text-fg">{note.content}</p>
              <p className="mt-2 text-xs text-muted">
                {typeLabel(note.type)}
                {note.trashedAt ? ` · ${t("Trashed {when}", { when: formatTrashed(note.trashedAt) })}` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg"
                  onClick={() => onRestore(note.id)}
                >
                  <RotateCcw className="size-4" />
                  {t("Restore")}
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-fg px-3 text-sm font-semibold text-bg"
                  onClick={() => onDelete(note.id)}
                >
                  <X className="size-4" />
                  {t("Delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
