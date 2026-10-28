import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { mystHtml } from "@/lib/tl/myst";
import { formatSource, isPageType, isSpan, kindOf, quotationFaces, safeHref, safeImage, typeLabel, type Note } from "@/lib/tl/model";
import { t } from "@/lib/tl/i18n";
import { languageMatches, languageName, currentLanguage } from "@/lib/tl/language";
import { importableAddress } from "@/lib/tl/import-entity";
import { bibliography, displayTitle, linkedFrom, otherTitles, passages, wikiIndex, wikiLinks, isWiki } from "@/lib/tl/wiki";
import { blendNotes, rankNotes } from "@/lib/tl/search";
import { shareQuotation } from "@/lib/tl/share";

const SHELVES = [
  { type: "persona", title: "Personae", noun: "personae" },
  { type: "book", title: "Works", noun: "works" },
  { type: "headword", title: "Lexicon", noun: "headwords" },
  { type: "page", title: "Pages", noun: "pages" },
  { type: "quotation", title: "Sayings", noun: "sayings" },
  { type: "link", title: "Links", noun: "links" },
] as const;

export function shelfName(type: string) {
  return t(SHELVES.find((item) => item.type === type)?.title ?? "");
}

export function WikiView({
  notes,
  query,
  stem,
  fuzzy,
  meaning,
  onEdit,
  onOpen,
  onBindBack,
  onBindHome,
  onBindShelf,
  onShelf,
  onImport,
  onExcerpt,
}: {
  notes: Note[];
  query: string;
  stem: boolean;
  fuzzy: boolean;
  meaning: Map<string, number>;
  onEdit: (id: string) => void;
  onOpen: (id: string | null) => void;
  onBindBack?: (fn: () => boolean) => void;
  onBindHome?: (fn: () => void) => void;
  onBindShelf?: (fn: (type: string) => void) => void;
  onShelf?: (type: string) => void;
  onImport: (url: string) => void;
  onExcerpt: (note: Note | null, source?: Note) => void;
}) {
  const entries = useMemo(
    () =>
      notes.filter(isWiki).sort((a, b) => {
        const title = (note: Note) => displayTitle(note);
        return title(a).localeCompare(title(b));
      }),
    [notes],
  );
  const index = useMemo(() => wikiIndex(notes), [notes]);
  const [designation, setDesignation] = useState("");
  const [shelf, setShelf] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [aliasOf, setAliasOf] = useState<string | null>(null);
  const open = entries.find((note) => note.id === openId) ?? null;
  const designations = [
    ...new Set(
      entries
        .filter((note) => !shelf || note.type === shelf)
        .map((note) => kindOf(note))
        .filter((item) => item !== ""),
    ),
  ].sort();
  const backRef = useRef<() => boolean>(() => false);
  const homeRef = useRef<() => void>(() => {});
  const rootRef = useRef<HTMLDivElement>(null);

  function show(id: string) {
    setAliasOf(null);
    setTrail((stack) => (openId ? [...stack, openId] : stack));
    setOpenId(id);
  }

  function back() {
    setAliasOf(null);
    setTrail((stack) => {
      setOpenId(stack.at(-1) ?? null);
      return stack.slice(0, -1);
    });
  }

  function home() {
    setAliasOf(null);
    setOpenId(null);
    setTrail([]);
    setDesignation("");
    setShelf("");
    rootRef.current?.scrollIntoView({ block: "start" });
  }

  function openCabinet(type: string) {
    setAliasOf(null);
    setOpenId(null);
    setTrail([]);
    setDesignation("");
    setShelf(type);
    rootRef.current?.scrollIntoView({ block: "start" });
  }

  const shelfRef = useRef<(type: string) => void>(() => {});
  backRef.current = () => {
    if (!openId) return false;
    back();
    return true;
  };
  homeRef.current = home;
  shelfRef.current = openCabinet;

  useEffect(() => {
    onBindBack?.(() => backRef.current());
    return () => onBindBack?.(() => false);
  }, [onBindBack]);

  useEffect(() => {
    onBindHome?.(() => homeRef.current());
    return () => onBindHome?.(() => {});
  }, [onBindHome]);

  useEffect(() => {
    onBindShelf?.((type) => shelfRef.current(type));
    return () => onBindShelf?.(() => {});
  }, [onBindShelf]);

  useEffect(() => {
    onShelf?.(open ? open.type : shelf);
  }, [open, shelf, onShelf]);

  const seenOpen = useRef(false);
  useEffect(() => {
    onOpen(open?.id ?? null);
  }, [open, onOpen]);

  useEffect(() => {
    if (open) {
      seenOpen.current = true;
      return;
    }
    if (!seenOpen.current) return;
    seenOpen.current = false;
    rootRef.current?.scrollIntoView({ block: "start" });
  }, [open]);

  function follow(target: string) {
    const found = index.get(target.trim().toLowerCase());
    if (found) show(found.id);
  }

  const shown = useMemo(() => {
    const narrowed = entries.filter((note) => {
      if (designation && kindOf(note) !== designation) return false;
      if (shelf && note.type !== shelf) return false;
      return true;
    });
    if (!query.trim()) return narrowed;
    return blendNotes(narrowed, rankNotes(narrowed, query, { stem, fuzzy }), meaning);
  }, [entries, designation, shelf, query, stem, fuzzy, meaning]);

  const front = !open && !query.trim() && !designation && !shelf;

  if (open) {
    const outbound = wikiLinks(open, index);
    const inbound = linkedFrom(open, notes, index);
    const written = open.type === "persona" ? bibliography(open, notes) : null;
    const found = open.type === "book" || open.type === "page" ? passages(open, notes, index) : [];
    const sayings = written
      ? uniqueNotes([
          ...written.writings,
          ...notes.filter((note) => note.type === "quotation" && note.attachedTo === open.id),
        ])
      : [];
    const placed = new Set([...(written?.books ?? []).map((item) => item.id), ...sayings.map((item) => item.id), ...found.map((item) => item.id)]);
    const related = [...outbound, ...inbound.filter((note) => !outbound.some((item) => item.id === note.id))].filter((note) => !placed.has(note.id));
    const faces = open.type === "quotation" ? quotationFaces(open) : null;
    const bookRows = open.book
      ? [
          ...open.book.translators.map((value) => ({ property: "translator", value })),
          open.book.form ? { property: "form", value: open.book.form } : null,
          open.book.language ? { property: "language", value: open.book.language } : null,
          open.book.originalTitle ? { property: "original title", value: open.book.originalTitle } : null,
          open.book.published ? { property: "published", value: open.book.published } : null,
          open.book.edition ? { property: "edition", value: open.book.edition } : null,
          open.book.publisher ? { property: "publisher", value: open.book.publisher } : null,
          open.book.place ? { property: "place", value: open.book.place } : null,
          open.book.isbn ? { property: "isbn", value: open.book.isbn } : null,
          ...open.book.subjects.map((value) => ({ property: "subject", value })),
        ].filter((row): row is { property: string; value: string } => row != null)
      : [];
    const statements = open.statements ?? [];
    const title = displayTitle(open);
    const titles = otherTitles(open);
    const portrait = safeImage(open.image);
    const creators = open.book?.authors ?? [];
    const body = open.content.trim();
    const showBody = !faces && body.length > 0 && !sameText(body, open.description ?? "") && !sameText(body, title);
    const outside = safeHref(open.url ?? "") || (open.sources ?? []).map((source) => safeHref(source.url)).find((href) => href) || "";
    const attached = notes.filter((note) => note.attachedTo === open.id).sort((a, b) => b.edited - a.edited);
    const linked = (value: string) => index.get(value.trim().toLowerCase());
    return (
      <article className="max-w-3xl pt-2 pb-16">
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="text-sm text-primary" onClick={back}>
            {trail.length > 0 ? t("Back") : shelf ? (SHELVES.find((item) => item.type === shelf)?.title ? t(SHELVES.find((item) => item.type === shelf)!.title) : t("Index")) : t("Repertorium")}
          </button>
          <div className="flex items-center">
            {open.type === "quotation" && (
              <button
                type="button"
                className="inline-flex h-11 items-center px-2 text-sm text-primary"
                onClick={() => {
                  void shareQuotation(open).then(
                    (result) => {
                      if (result === "copied") toast.success(t("Quotation copied"));
                    },
                    () => toast.error(t("Could not share that quotation")),
                  );
                }}
              >
                {t("Share")}
              </button>
            )}
            <button type="button" className="inline-flex h-11 items-center px-2 text-sm text-primary" onClick={() => onEdit(open.id)}>
              Edit
            </button>
          </div>
        </div>
        <Excerptable
          onChoose={(text, kind) => {
            if (kind === "copy") {
              void navigator.clipboard.writeText(text).then(
                () => toast.success(t("Copied")),
                () => toast.error(t("Could not copy")),
              );
              return;
            }
            if (kind === "quotation") {
              const saying = excerptFrom(open, text);
              onExcerpt(saying);
              show(saying.id);
              return;
            }
            if (kind === "alias") {
              const name = text.trim();
              const key = name.toLowerCase();
              const found = index.get(key);
              if (found && found.id !== open.id) {
                toast.message("That name already belongs to another page");
                return;
              }
              const labels = open.labels ?? [];
              const known = labels.some((item) => item.text.trim().toLowerCase() === key) || displayTitle(open).trim().toLowerCase() === key;
              if (known) {
                toast.message("Already a name of this page");
                return;
              }
              onExcerpt(null, { ...open, labels: [...labels, { text: name, language: currentLanguage() }], edited: Date.now() });
              toast.success(`Also called ${name}`);
              return;
            }
            if (kind === "alias-of") {
              setAliasOf(text.trim());
              return;
            }
            const found = index.get(text.trim().toLowerCase());
            if (found?.id === open.id) {
              toast.message("That is this page");
              return;
            }
            const made = found ?? stub(kind, text, open);
            const source = weaveNote(open, text);
            onExcerpt(found ? null : made, source.content !== open.content ? source : undefined);
            show(made.id);
          }}
        >
          {aliasOf ? (
            <AliasPicker
              name={aliasOf}
              pages={entries.filter((note) => note.id !== open.id && note.type !== "link")}
              onClose={() => setAliasOf(null)}
              onPick={(target) => {
                const name = aliasOf.trim();
                const key = name.toLowerCase();
                const owner = index.get(key);
                if (owner && owner.id !== target.id) {
                  toast.message("That name already belongs to another page");
                  return;
                }
                const labels = target.labels ?? [];
                const known = labels.some((item) => item.text.trim().toLowerCase() === key) || displayTitle(target).trim().toLowerCase() === key;
                const named = known ? target : { ...target, labels: [...labels, { text: name, language: currentLanguage() }], edited: Date.now() };
                const source = weaveNote(open, name);
                onExcerpt(named, source.content !== open.content ? source : undefined);
                toast.success(known ? `Linked to ${displayTitle(target)}` : `${name} is another name of ${displayTitle(target)}`);
                setAliasOf(null);
              }}
            />
          ) : null}
          <div className="mt-4">
          {faces ? (
            <div>
              <h2 className="text-base leading-relaxed text-pretty text-fg">“{faces.primary}”</h2>
              {faces.translator ? <p className="mt-2 text-sm text-muted">{t("Translated by")} {faces.translator}</p> : null}
              {faces.showOriginal ? (
                <div className="mt-4">
                  <p className="text-sm text-muted">{faces.originalLanguage ? `Original (${languageName(faces.originalLanguage)})` : "Original"}</p>
                  <p className="mt-1 text-base leading-relaxed text-pretty text-fg">“{faces.original}”</p>
                </div>
              ) : null}
            </div>
          ) : open.type === "book" ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {portrait ? <img src={portrait} alt="" className="h-52 w-36 shrink-0 rounded-md border border-border object-cover" /> : null}
              <div className="min-w-0">
                <h2 className="font-display text-xl leading-snug text-pretty text-fg">{title}</h2>
                {alsoLine(titles) ? <p className="mt-1 text-sm text-muted">{t("Also")} {alsoLine(titles)}</p> : null}
                {creators.length > 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    {creators.map((name, index) => {
                      const href = linked(name);
                      return (
                        <span key={`${name}-${index}`}>
                          {index > 0 ? ", " : null}
                          {href ? (
                            <button type="button" className="text-fg hover:text-primary" onClick={() => show(href.id)}>
                              {name}
                            </button>
                          ) : (
                            <span className="text-fg">{name}</span>
                          )}
                        </span>
                      );
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="font-display text-xl leading-snug text-pretty text-fg">{title}</h2>
              {alsoLine(titles) ? <p className="mt-1 text-sm text-muted">{t("Also")} {alsoLine(titles)}</p> : null}
              {open.description && !sameText(open.description, title) ? <p className="mt-2 text-sm text-muted">{open.description}</p> : null}
              {portrait || showBody ? (
                <div className="mt-5 flex flex-col gap-4 sm:flex-row">
                  {portrait ? <img src={portrait} alt="" className="h-36 w-28 shrink-0 rounded-md object-cover" /> : null}
                  {showBody ? <p className="line-clamp-6 text-base leading-relaxed text-fg">{plainLede(open)}</p> : null}
                </div>
              ) : null}
            </div>
          )}
          {open.type === "book" && showBody ? <p className="mt-5 max-w-2xl text-base leading-relaxed text-fg">{plainLede(open)}</p> : null}
          {showBody && body.length > plainLede(open).length + 24 ? (
            <div
              className="myst mt-5 max-w-2xl text-base leading-relaxed text-fg"
              dangerouslySetInnerHTML={{ __html: mystHtml(open.content, true) }}
              onClick={(event) => {
                const link = (event.target as HTMLElement).closest("a[data-wiki]");
                if (!(link instanceof HTMLAnchorElement)) return;
                event.preventDefault();
                follow(link.dataset.wiki ?? "");
              }}
            />
          ) : null}
          </div>
        </Excerptable>
        {open.type === "link" && outside ? (
          <a href={outside} target="_blank" rel="noreferrer" className="mt-5 flex max-w-xl items-start gap-4">
            {open.preview?.image ? (
              <img src={open.preview.image} alt="" className="h-24 w-36 shrink-0 rounded-md object-cover" onError={(event) => event.currentTarget.remove()} />
            ) : null}
            <span className="min-w-0">
              {open.preview?.site ? <span className="block text-sm text-muted">{open.preview.site}</span> : null}
              <span className="mt-1 block text-base leading-snug text-fg">{open.preview?.line || (open.url ?? "").replace(/^https?:\/\//, "")}</span>
            </span>
          </a>
        ) : null}
        {open.type === "link" && importableAddress(open.url ?? "") ? (
          <button
            type="button"
            className="mt-3 inline-flex h-11 items-center rounded-md border border-border px-4 text-sm text-primary"
            onClick={() => onImport(open.url ?? "")}
          >
            Bring in the page
          </button>
        ) : null}
        {(bookRows.length > 0 || statements.length > 0) && (
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {bookRows.map((item) => (
              <div key={`${item.property}-${item.value}`} className={item.value.length > 80 ? "col-span-2 sm:col-span-3" : undefined}>
                <dt className="text-muted">{factLabel(item.property)}</dt>
                <dd className="break-words text-fg">
                  <FactValue value={item.value} onOpen={linked(item.value) ? () => show(linked(item.value)!.id) : undefined} />
                </dd>
              </div>
            ))}
            {statements.map((item) => (
              <div key={item.id} className={item.value.length > 80 ? "col-span-2 sm:col-span-3" : undefined}>
                <dt className="text-muted">{factLabel(item.property)}</dt>
                <dd className="break-words text-fg">
                  <FactValue value={item.value} onOpen={linked(item.value) ? () => show(linked(item.value)!.id) : undefined} />
                  {item.qualifiers.length > 0 ? (
                    <span className="mt-0.5 block text-xs text-muted">
                      {item.qualifiers.map((qualifier) => `${qualifier.property}: ${qualifier.value}`).join(" · ")}
                    </span>
                  ) : null}
                  {item.source ? <span className="mt-0.5 block text-xs text-muted">{item.source}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {open.type !== "link" && outside ? (
          <a href={outside} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-11 items-center text-sm text-primary">
            {open.preview?.site || "Source"}
          </a>
        ) : null}
        {open.sources && open.sources.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1 text-sm text-muted">
            {open.sources.map((source) => {
              const line = formatSource(source);
              const href = safeHref(source.url);
              return (
                <li key={source.id}>
                  {line ? <span>— {line}</span> : null}
                  {href ? (
                    <>
                      {" "}
                      <a href={href} target="_blank" rel="noreferrer" className="text-primary">
                        source
                      </a>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {written && written.books.length > 0 ? (
          <section>
            <h2 className="mt-8 font-display text-xl text-fg">{t("Bibliography")}</h2>
            <ul className="mt-2">
              {written.books.map((item) => (
                <EntryRow
                  key={item.id}
                  title={displayTitle(item)}
                  meta={[item.book?.published, item.book?.language, item.book?.form].filter(Boolean).join(" · ")}
                  onClick={() => show(item.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
        {sayings.length > 0 ? (
          <section>
            <h2 className="mt-8 font-display text-xl text-fg">{t("Sayings")}</h2>
            <ul className="mt-2">
              {sayings.map((item) => {
                const cite = item.sources?.[0] ? formatSource(item.sources[0]) : "";
                return <EntryRow key={item.id} title={`“${sayingLine(item)}”`} meta={cite || undefined} onClick={() => show(item.id)} />;
              })}
            </ul>
          </section>
        ) : null}
        {found.length > 0 && (
          <section>
            <h2 className="mt-8 font-display text-xl text-fg">{t("In this work")}</h2>
            <ul className="mt-2">
              {found.map((item) => {
                const cite = item.sources?.[0] ? formatSource(item.sources[0]) : "";
                return <EntryRow key={item.id} title={`“${sayingLine(item)}”`} meta={cite ? `— ${cite}` : undefined} onClick={() => show(item.id)} />;
              })}
            </ul>
          </section>
        )}
        {related.length > 0 && (
          <section>
            <h2 className="mt-8 font-display text-xl text-fg">{t("See also")}</h2>
            <ul className="mt-2">
              {related.map((note) => (
                <EntryRow key={note.id} title={note.type === "quotation" ? `“${sayingLine(note)}”` : displayTitle(note)} meta={listLine(note)} onClick={() => show(note.id)} />
              ))}
            </ul>
          </section>
        )}
        {isPageType(open.type) && attached.filter((note) => note.type !== "quotation").length > 0 && (
          <section>
            <h2 className="mt-8 font-display text-xl text-fg">{t("Notes")}</h2>
            <ul className="mt-2">
              {attached
                .filter((note) => note.type !== "quotation")
                .map((note) => (
                  <EntryRow
                    key={note.id}
                    title={note.content.split("\n")[0] || typeLabel(note.type)}
                    meta={typeLabel(note.type)}
                    onClick={() => onEdit(note.id)}
                  />
                ))}
            </ul>
          </section>
        )}
      </article>
    );
  }

  return front ? (
    <Front
      rootRef={rootRef}
      entries={entries}
      onOpen={show}
      onCabinet={openCabinet}
    />
  ) : (
    <div ref={rootRef} className="pt-2 pb-16">
      {(shelf || query.trim()) && (
        <div className="mt-1">
          <h2 className="font-display text-2xl text-fg">
            {query.trim() ? t("Matches") : (SHELVES.find((item) => item.type === shelf)?.title ? t(SHELVES.find((item) => item.type === shelf)!.title) : t("Pages"))}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            {query.trim() ? (shown.length === 1 ? "1 page" : `${shown.length} pages`) : shelfBlurb(shelf)}
          </p>
        </div>
      )}
      {designations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChip selected={designation === ""} onClick={() => setDesignation("")}>
            All
          </FilterChip>
          {designations.map((item) => (
            <FilterChip key={item} selected={designation === item} onClick={() => setDesignation(designation === item ? "" : item)}>
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </FilterChip>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-pretty text-muted">
          {query.trim() || designation || shelf
            ? "Nothing in the repertorium matches."
            : "No pages yet. A page, a quotation, or a headword will be listed here. Link one to another with [[Name]] or {doc}`Name`."}
        </p>
      ) : (
        <ul className="mt-4">
          {shown.map((note) => (
            <li key={note.id} className="border-t border-border py-3">
              {(() => {
                const picture = pictureOf(note);
                return (
                  <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => show(note.id)}>
                    {picture ? <img src={picture} alt="" className="mt-0.5 h-14 w-11 shrink-0 rounded-md object-cover" /> : null}
                    <span className="min-w-0">
                      {note.type === "quotation" ? (
                        <QuotationLine note={note} />
                      ) : (
                        <>
                          <span className="block font-display text-lg leading-snug text-pretty text-fg">{displayTitle(note)}</span>
                          <span className="mt-0.5 block text-sm text-muted">{listLine(note) || rowMeta(note, shelf)}</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryRow({ title, meta, onClick }: { title: string; meta?: string; onClick: () => void }) {
  return (
    <li className="border-t border-border py-3">
      <button type="button" className="w-full text-left" onClick={onClick}>
        <span className="block text-base leading-snug text-pretty text-fg">{title}</span>
        {meta ? <span className="mt-0.5 block text-sm text-muted">{meta}</span> : null}
      </button>
    </li>
  );
}

function FactValue({ value, onOpen }: { value: string; onOpen?: () => void }) {
  if (!onOpen) return value;
  return (
    <button type="button" className="text-left text-fg hover:text-primary" onClick={onOpen}>
      {value}
    </button>
  );
}

function pictureOf(note: Note) {
  return safeImage(note.image) || safeImage(note.preview?.image);
}

function alsoLine(titles: { text: string; language: string }[]) {
  return titles
    .slice(0, 4)
    .map((item) => (item.language ? `${item.language} ${item.text}` : item.text))
    .join(", ");
}

function sayingLine(note: Note) {
  const text = quotationFaces(note).primary.replace(/\s+/g, " ").trim();
  return text.length > 96 ? `${text.slice(0, 95).trimEnd()}…` : text;
}

function uniqueNotes(notes: Note[]) {
  const seen = new Set<string>();
  const all: Note[] = [];
  for (const note of notes) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);
    all.push(note);
  }
  return all;
}

function listLine(note: Note) {
  if (note.type === "persona") {
    const also = alsoLine(otherTitles(note));
    return also ? `Also ${also}` : note.description?.trim() || "";
  }
  if (note.type === "book") return [note.book?.authors.join(", "), note.book?.published, note.book?.form].filter(Boolean).join(" · ");
  if (note.type === "quotation") return "";
  return note.description?.trim() || "";
}

function shelfBlurb(type: string) {
  const lines: Record<string, string> = {
    persona: "One person, however many names the pages use.",
    book: "A work, with its author and its date.",
    headword: "A word, in the language it was kept.",
    page: "Pages that are not a person, a work, or a word.",
    quotation: "Sayings, in the language you are reading, then the original.",
    link: "Addresses, with the preview that came back with them.",
  };
  return t(lines[type] ?? "");
}

function rowMeta(note: Note, shelf: string, about = true) {
  const kind = kindOf(note);
  const cabinet = note.type === shelf ? "" : shelfName(note.type);
  const line = about && note.type !== "quotation" ? (note.description?.trim() ?? "") : "";
  return [kind ? t(kind) : "", cabinet, line].filter(Boolean).join(" · ");
}

function excerptFrom(page: Note, text: string): Note {
  const pageLanguage = page.book?.language?.trim() || "";
  const sourceLanguage = page.book?.originalLanguage?.trim() || pageLanguage;
  const translators = (page.book?.translators ?? []).map((item) => item.trim()).filter(Boolean);
  const translated = translators.length > 0 && pageLanguage !== "" && sourceLanguage !== "" && !languageMatches(pageLanguage, sourceLanguage);
  const language = translated ? pageLanguage : sourceLanguage;
  const author = page.type === "persona" ? displayTitle(page) : (page.book?.authors ?? []).map((item) => item.trim()).filter(Boolean).join(", ");
  const work = page.type === "persona" ? "" : displayTitle(page);
  const published = page.book?.published?.trim() ?? "";
  const edition = page.book?.edition?.trim() ?? "";
  const now = Date.now();
  const note: Note = {
    id: crypto.randomUUID(),
    type: "quotation",
    content: text,
    tags: [],
    created: now,
    edited: now,
    date: page.date && !isSpan(page.date) ? page.date : null,
    attachedTo: page.id,
    labels: [{ text, language }],
  };
  if (language) note.originalLanguage = language;
  if (author || work || published || edition) {
    note.sources = [{ id: crypto.randomUUID(), author, work, container: "", edition, locator: "", published, url: "" }];
  }
  if (translated) note.languages = [{ id: crypto.randomUUID(), language: pageLanguage, text, translator: translators.join(", ") }];
  return note;
}

function worthExcerpt(text: string) {
  if (text.length > 1200) return false;
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(text)) return [...text].length >= 2;
  return text.length >= 12;
}

function stub(kind: "headword" | "page" | "persona" | "book", text: string, host: Note): Note {
  const now = Date.now();
  const note: Note = {
    id: crypto.randomUUID(),
    type: kind,
    content: text,
    tags: [],
    created: now,
    edited: now,
    date: null,
    labels: [{ text, language: "" }],
    attachedTo: host.id,
  };
  if (kind === "page") note.designation = "concept";
  if (kind === "persona") note.designation = "person";
  if (kind === "book") {
    note.book = {
      subtitle: "",
      authors: host.type === "persona" ? [displayTitle(host)] : [],
      translators: [],
      language: host.book?.language ?? "",
      originalTitle: "",
      originalLanguage: "",
      form: "",
      publisher: "",
      place: "",
      published: "",
      edition: "",
      isbn: "",
      subjects: [],
    };
  }
  return note;
}

function weave(content: string, text: string) {
  const at = content.indexOf(text);
  if (at < 0) return content;
  if (content.slice(Math.max(0, at - 2), at) === "[[" || content.slice(at + text.length, at + text.length + 2) === "]]") return content;
  return `${content.slice(0, at)}[[${text}]]${content.slice(at + text.length)}`;
}

function weaveNote(page: Note, text: string): Note {
  const content = weave(page.content, text);
  if (content === page.content) return page;
  return { ...page, content, edited: Date.now() };
}

function worthPage(text: string) {
  return text.length > 0 && text.length <= 80 && !/[.!?。]/.test(text);
}

function AliasPicker({
  name,
  pages,
  onClose,
  onPick,
}: {
  name: string;
  pages: Note[];
  onClose: () => void;
  onPick: (note: Note) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = pages
    .filter((note) => {
      if (!needle) return true;
      const title = displayTitle(note).toLowerCase();
      if (title.includes(needle)) return true;
      return (note.labels ?? []).some((item) => item.text.toLowerCase().includes(needle));
    })
    .slice(0, 8);
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-sm text-pretty text-fg">
          <span className="font-semibold">{name}</span> is another name of
        </p>
        <button type="button" className="shrink-0 text-sm text-primary" onClick={onClose}>
          Cancel
        </button>
      </div>
      <input className="field mt-2" value={query} placeholder="Find the page" autoFocus onChange={(event) => setQuery(event.target.value)} />
      <ul className="mt-1">
        {shown.map((note) => (
          <li key={note.id} className="border-t border-border">
            <button type="button" className="flex w-full flex-col py-2 text-left" onClick={() => onPick(note)}>
              <span className="text-sm text-fg">{displayTitle(note)}</span>
              <span className="text-xs text-muted">{shelfName(note.type) || typeLabel(note.type)}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="border-t border-border py-2 text-sm text-muted">{t("No page by that name. Make the page first, then give it this name.")}</li> : null}
      </ul>
    </div>
  );
}

type Choice = "copy" | "alias" | "alias-of" | "headword" | "page" | "persona" | "book" | "quotation";

function Excerptable({ children, onChoose }: { children: ReactNode; onChoose: (text: string, kind: Choice) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [offer, setOffer] = useState<{ text: string; top: number } | null>(null);

  function look() {
    const root = ref.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      setOffer(null);
      return;
    }
    const text = selection.toString().replace(/\s+/g, " ").trim();
    const range = selection.getRangeAt(0);
    if (!text || text.length > 1200 || !root.contains(range.commonAncestorContainer)) {
      setOffer(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const host = root.getBoundingClientRect();
    const above = rect.top - host.top - 46;
    setOffer({ text, top: above < 0 ? rect.bottom - host.top + 8 : above });
  }

  const page = offer ? worthPage(offer.text) : false;
  const saying = offer ? worthExcerpt(offer.text) : false;
  const choices: { kind: Choice; label: string }[] = offer
    ? [
        { kind: "copy", label: "Copy" },
        ...(page
          ? [
              { kind: "alias" as const, label: "Alias" },
              { kind: "alias-of" as const, label: "Alias of…" },
              { kind: "headword" as const, label: "Word" },
              { kind: "page" as const, label: "Concept" },
              { kind: "persona" as const, label: "Person" },
              { kind: "book" as const, label: "Work" },
            ]
          : []),
        ...(saying ? [{ kind: "quotation" as const, label: "Saying" }] : []),
      ]
    : [];

  return (
    <div ref={ref} className="relative" onMouseUp={look} onTouchEnd={() => window.setTimeout(look, 40)}>
      {offer ? (
        <div
          className="absolute inset-x-0 z-10 flex flex-wrap gap-1 rounded-xl bg-fg p-1"
          style={{ top: offer.top }}
          onPointerDown={(event) => event.preventDefault()}
        >
          {choices.map((choice) => (
            <button
              key={choice.kind}
              type="button"
              className="rounded-lg px-2.5 py-1.5 text-sm text-bg"
              onClick={() => {
                onChoose(offer.text, choice.kind);
                setOffer(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function factLabel(property: string) {
  const named: Record<string, string> = {
    author: "Creator",
    translator: "Translator",
    form: "Type",
    language: "Language",
    "original title": "Original title",
    published: "Date",
    edition: "Edition",
    publisher: "Publisher",
    place: "Place",
    isbn: "ISBN",
    subject: "Subject",
  };
  return named[property] ?? property.charAt(0).toUpperCase() + property.slice(1);
}

function sameText(left: string, right: string) {
  return left.replace(/\s+/g, " ").trim().toLowerCase() === right.replace(/\s+/g, " ").trim().toLowerCase();
}

function Front({
  rootRef,
  entries,
  onOpen,
  onCabinet,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  entries: Note[];
  onOpen: (id: string) => void;
  onCabinet: (type: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div ref={rootRef} className="pt-2 pb-16">
        <p className="mt-6 text-sm text-pretty text-muted">
          No pages yet. A page, a quotation, or a headword will be listed here. Link one to another with [[Name]] or {`{doc}\`Name\``}.
        </p>
      </div>
    );
  }
  const feature = featureOf(entries);
  const saying = sayingOf(entries);
  const shelves = SHELVES.map((item) => ({ ...item, notes: entries.filter((note) => note.type === item.type) })).filter((item) => item.notes.length > 0);
  const faces = saying ? quotationFaces(saying) : null;
  const cite = saying?.sources?.[0] ? formatSource(saying.sources[0]) : "";
  return (
    <div ref={rootRef} className="max-w-3xl pt-2 pb-16">
      {feature ? (
        <button type="button" className="w-full text-left" onClick={() => onOpen(feature.id)}>
          <p className="text-sm text-muted">{shelfName(feature.type) || t("Page")}</p>
          <div className="mt-3 flex gap-4">
            {safeImage(feature.image) ? (
              <img
                src={safeImage(feature.image)}
                alt=""
                className={
                  feature.type === "book"
                    ? "h-52 w-36 shrink-0 rounded-md border border-border object-cover"
                    : "h-36 w-28 shrink-0 rounded-md object-cover"
                }
              />
            ) : null}
            <span className="min-w-0">
              <span className="block font-display text-2xl leading-snug text-pretty text-fg">{displayTitle(feature)}</span>
              <span className="mt-1 block text-sm text-muted">{rowMeta(feature, "", false)}</span>
              {plainLede(feature) ? <span className="mt-2 line-clamp-6 block text-base leading-relaxed text-pretty text-fg">{plainLede(feature)}</span> : null}
            </span>
          </div>
        </button>
      ) : null}
      {saying && faces ? (
        <button type="button" className="mt-8 w-full border-t border-border py-4 text-left" onClick={() => onOpen(saying.id)}>
          <p className="text-sm text-muted">{t("A saying")}</p>
          <span className="mt-2 block text-base leading-relaxed text-pretty text-fg">“{faces.primary}”</span>
          {faces.showOriginal ? (
            <span className="mt-3 block text-base leading-relaxed text-pretty text-fg">“{faces.original}”</span>
          ) : null}
          {cite ? <span className="mt-2 block text-sm text-muted">— {cite}</span> : null}
        </button>
      ) : null}
      <ul className="mt-8" aria-label="Shelves">
        {shelves.map((item) => (
          <li key={item.type} className="border-t border-border">
            <button type="button" className="w-full py-3 text-left" onClick={() => onCabinet(item.type)}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-xl text-fg">{t(item.title)}</span>
                <span className="shrink-0 text-sm text-muted tabular-nums">{item.notes.length}</span>
              </span>
              <span className="mt-1 block truncate text-sm text-muted">
                {item.notes
                  .slice(0, 3)
                  .map((note) => displayTitle(note))
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function featureOf(entries: Note[]) {
  const prose = entries.filter((note) => note.type === "persona" || note.type === "book" || note.type === "page" || note.type === "headword");
  if (prose.length === 0) return null;
  const weight = (note: Note) => (safeImage(note.image) ? 800 : 0) + Math.min(note.content.length, 2400) + (note.description ? 120 : 0);
  return [...prose].sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id))[0];
}

function sayingOf(entries: Note[]) {
  const quotes = entries.filter((note) => note.type === "quotation").sort((a, b) => a.id.localeCompare(b.id));
  if (quotes.length === 0) return null;
  const day = Math.floor(Date.now() / 86_400_000);
  return quotes[day % quotes.length] ?? null;
}

function plainLede(note: Note) {
  const raw = (note.description?.trim() || note.content || "").trim();
  const plain = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\{[a-z]+\}`[^`]*`/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clip(plain, 280);
}

function clip(text: string, limit: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  const stop = cut.lastIndexOf(" ");
  return `${(stop > limit * 0.6 ? cut.slice(0, stop) : cut).trimEnd()}…`;
}

function QuotationLine({ note }: { note: Note }) {
  const faces = quotationFaces(note);
  return (
    <>
      <span className="block text-base leading-snug text-pretty text-fg">“{faces.primary}”</span>
      {faces.showOriginal ? (
        <span className="mt-1 block text-base leading-snug text-pretty text-fg">“{faces.original}”</span>
      ) : null}
    </>
  );
}

function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={selected ? "rounded-full bg-primary/15 px-3 py-1.5 text-sm text-fg" : "rounded-full bg-bg px-3 py-1.5 text-sm text-muted"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
