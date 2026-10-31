import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, MoreVertical, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatRecorded, formatSource, kindOf, mediaLine, quotationFaces, safeColor, safeHref, safeImage, safeVideo, typeLabel, type Note } from "@/lib/tl/model";
import { shownFile } from "@/lib/tl/file-media";
import { languageName } from "@/lib/tl/language";
import { otherTitles } from "@/lib/tl/wiki";
import { mystHtml } from "@/lib/tl/myst";
import { shareQuotation, onMobile } from "@/lib/tl/share";
import { t } from "@/lib/tl/i18n";
import { cn, Highlight } from "@/components/tl/ui";
const TIMELINE_LIMIT = 480;

export function useStoredSrc(value: string) {
  const [src, setSrc] = useState(value.startsWith("tlfile:") ? "" : value);
  useEffect(() => {
    if (!value.startsWith("tlfile:")) {
      setSrc(value);
      return;
    }
    let stop = false;
    void shownFile(value).then((url) => {
      if (!stop) setSrc(url);
    });
    return () => {
      stop = true;
    };
  }, [value]);
  return src;
}

function clip(text: string) {
  if (text.length <= TIMELINE_LIMIT) return text;
  const slice = text.slice(0, TIMELINE_LIMIT);
  const broken = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  const cut = broken > TIMELINE_LIMIT * 0.75 ? slice.slice(0, broken) : slice;
  return `${cut.trimEnd()}…`;
}

export function NoteCard({
  note,
  query,
  flash,
  plain,
  holdToMove,
  onEdit,
  onTrash,
  onToggleTag,
  onToggleDone,
  onHold,
  onSweep,
  selected,
  picking,
}: {
  note: Note;
  query: string;
  flash: boolean;
  plain?: boolean;
  holdToMove?: boolean;
  onEdit: (id: string) => void;
  onTrash: (id: string) => void;
  onToggleTag: (tag: string) => void;
  onToggleDone?: (id: string) => void;
  onHold?: (id: string) => void;
  onSweep?: (id: string) => void;
  selected?: boolean;
  picking?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [linkMenu, setLinkMenu] = useState<{ href: string; left: number; top: number } | null>(null);
  const start = useRef<{ x: number; y: number; pointerId: number; at: number } | null>(null);
  const moved = useRef(0);
  const pressTimer = useRef<number | null>(null);
  const linkPress = useRef<number | null>(null);
  const longPressed = useRef(false);
  const lastTap = useRef(0);
  const color = note.type === "period" ? safeColor(note.color) : null;
  const picture = useStoredSrc(safeImage(note.image));
  const clipSrc = useStoredSrc(safeVideo(note.video));
  const previewImage = useStoredSrc(note.preview?.image ?? "");
  const recorded =
    note.edited !== note.created
      ? `Last edited ${formatRecorded(note.edited)}. Written ${formatRecorded(note.created)}.`
      : `Written ${formatRecorded(note.created)}.`;

  function clearPress() {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function offerLink(href: string, x: number, y: number) {
    const canShare = onMobile() && typeof navigator.share === "function";
    const width = 168;
    const height = (canShare ? 3 : 2) * 44 + 8;
    const left = Math.min(Math.max(8, x), window.innerWidth - width - 8);
    const top = Math.min(Math.max(8, y), window.innerHeight - height - 8);
    setLinkMenu({ href, left, top });
  }

  function holdLink(event: ReactPointerEvent<HTMLElement>, href: string) {
    if (event.button !== 0 || !href) return;
    const startX = event.clientX;
    const startY = event.clientY;
    if (linkPress.current != null) window.clearTimeout(linkPress.current);
    linkPress.current = window.setTimeout(() => {
      linkPress.current = null;
      offerLink(href, startX, startY);
    }, 650);
    const node = event.currentTarget;
    const end = () => {
      if (linkPress.current != null) {
        window.clearTimeout(linkPress.current);
        linkPress.current = null;
      }
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
    };
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) end();
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  useEffect(() => {
    if (!linkMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLinkMenu(null);
    };
    const close = () => setLinkMenu(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [linkMenu]);

  return (
    <>
    <article
      data-note-id={note.id}
      className="relative overflow-hidden rounded-xl"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="absolute inset-y-0 right-0 flex w-28">
        <button
          type="button"
          className="flex flex-1 items-center justify-center bg-primary text-primary-fg"
          aria-label={t("Edit {type}", { type: typeLabel(note.type) })}
          onClick={() => onEdit(note.id)}
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center bg-fg text-bg"
          aria-label={t("Move to trash")}
          onClick={() => {
            setRevealed(false);
            onTrash(note.id);
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div
        data-kind={note.type}
        data-pick-id={note.id}
        className={cn(
          "relative flex gap-1 bg-surface py-3 pr-1 pl-3 lift",
          flash && "note-flash",
          revealed && !picking && "-translate-x-28",
          selected && "note-picked",
        )}
        style={{
          transition: "transform 160ms ease-out",
          boxShadow: color && !selected ? `inset 3px 0 0 ${color}, var(--shadow-border)` : undefined,
          touchAction: "pan-y",
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest("[data-no-press]")) return;
          start.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, at: Date.now() };
          moved.current = 0;
          longPressed.current = false;
          clearPress();
          if (holdToMove || (!onHold && event.pointerType !== "touch")) return;
          if (picking) return;
          const node = event.currentTarget as HTMLElement;
          const pointerId = event.pointerId;
          pressTimer.current = window.setTimeout(() => {
            longPressed.current = true;
            if (onHold) onHold(note.id);
            else onEdit(note.id);
            try {
              node.style.touchAction = "none";
              node.setPointerCapture(pointerId);
            } catch {
              /* the press already ended */
            }
            requestAnimationFrame(() => {
              node.style.touchAction = "none";
            });
          }, 500);
        }}
        onPointerMove={(event) => {
          if (!start.current || start.current.pointerId !== event.pointerId) return;
          const dx = event.clientX - start.current.x;
          const dy = event.clientY - start.current.y;
          moved.current = Math.max(moved.current, Math.hypot(dx, dy));
          if (longPressed.current && onSweep) {
            const id = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-pick-id]")?.getAttribute("data-pick-id");
            if (id) onSweep(id);
            return;
          }
          if (moved.current > 10) clearPress();
        }}
        onPointerUp={(event) => {
          clearPress();
          if (!start.current || start.current.pointerId !== event.pointerId) return;
          if (holdToMove && Date.now() - start.current.at >= 500) {
            start.current = null;
            return;
          }
          if (longPressed.current) {
            start.current = null;
            return;
          }
          const dx = event.clientX - start.current.x;
          const dy = event.clientY - start.current.y;
          const horizontal = Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2;
          if (horizontal && !picking) setRevealed(dx < 0);
          else if (picking && !longPressed.current && moved.current < 8 && selected && onHold && Date.now() - start.current.at < 500) onHold(note.id);
          else if (!picking && !longPressed.current && event.pointerType === "touch" && moved.current < 8) {
            const now = Date.now();
            if (now - lastTap.current < 300) {
              lastTap.current = 0;
              onEdit(note.id);
            } else {
              lastTap.current = now;
            }
          }
          start.current = null;
        }}
        onPointerCancel={() => {
          clearPress();
          start.current = null;
        }}
        onDoubleClick={(event) => {
          if (picking || (event.target as HTMLElement).closest("[data-no-press]")) return;
          onEdit(note.id);
        }}
        onClick={() => {
          if (revealed) setRevealed(false);
        }}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest("[data-no-press]")) return;
          event.preventDefault();
        }}
      >
        <div className="min-w-0 flex-1">
          <div className={cn(note.type === "quotation" && "min-h-11 pr-11")}>
          {picture && (
            <img src={picture} alt="" className="mb-3 max-h-40 w-full rounded-xl object-cover" />
          )}
          <MediaFactsLine facts={note.imageFacts} />
          {clipSrc && (
            <div className="mb-3" data-no-press>
              {note.video?.startsWith("data:audio/") || note.video?.endsWith(".m4a") ? (
                <audio src={clipSrc} controls preload="metadata" className="w-full" />
              ) : (
                <video src={clipSrc} controls playsInline preload="metadata" className="max-h-48 w-full rounded-xl bg-bg" />
              )}
            </div>
          )}
          <MediaFactsLine facts={note.videoFacts} />
          <div className="flex gap-2">
            {note.type === "task" && onToggleDone && (
              <button
                type="button"
                data-no-press
                aria-pressed={note.done === true}
                aria-label={note.done ? t("Mark not done") : t("Mark done")}
                className={cn(
                  "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border",
                  note.done ? "border-primary bg-primary text-primary-fg" : "border-border bg-bg text-transparent",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleDone(note.id);
                }}
              >
                <Check className="size-3.5" />
              </button>
            )}
            <div
              className={cn(
                "min-w-0 text-pretty text-base leading-relaxed text-fg [overflow-wrap:anywhere]",
                note.type !== "page" && note.type !== "headword" && note.type !== "persona" && note.type !== "book" && "whitespace-pre-wrap",
                note.done && "text-muted line-through",
              )}
            >
              {note.type === "quotation" ? (
                <QuotationBody note={note} query={query} />
              ) : note.type === "page" || note.type === "headword" || note.type === "persona" || note.type === "book" ? (
                <span className="myst block" dangerouslySetInnerHTML={{ __html: mystHtml(clip(note.content)) }} />
              ) : (
                <Highlight text={clip(note.content)} query={query} />
              )}
            </div>
          </div>
          {(note.type === "page" || note.type === "headword" || note.type === "persona" || note.type === "book") && (note.description || kindOf(note) || otherTitles(note).length > 0) && (
            <div className="mt-2 text-sm text-pretty text-muted">
              {kindOf(note) ? <p className="text-xs tracking-wide uppercase">{t(kindOf(note))}</p> : null}
              {note.description ? <p>{note.description}</p> : null}
              {otherTitles(note).length > 0 ? (
                <p className="mt-1">
                  {otherTitles(note)
                    .map((item) => (item.language ? `${item.language}: ${item.text}` : item.text))
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          )}
          {note.statements && note.statements.some((item) => note.type !== "quotation" || item.property.trim().toLowerCase() !== "author") && (
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              {note.statements.filter((item) => note.type !== "quotation" || item.property.trim().toLowerCase() !== "author").slice(0, 6).map((item) => (
                <div key={item.id} className="grid grid-cols-[7rem_1fr] gap-2">
                  <dt className="text-muted">{item.property}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {note.type === "quotation" && kindOf(note) ? (
            <p className="mt-2 text-xs tracking-wide text-muted uppercase">{t(kindOf(note))}</p>
          ) : null}
          {note.type === "link" && safeHref(note.url ?? "") && (
            <div className="mt-2 flex flex-col gap-2">
              {(note.preview?.image || note.preview?.line) && (
                <button
                  type="button"
                  data-no-press
                  className="link-preview flex items-center gap-3 text-left text-sm text-primary select-none"
                  style={{ WebkitTouchCallout: "none" }}
                  aria-label={t("Share or copy link")}
                  onClick={(event) => event.stopPropagation()}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const href = safeHref(note.url ?? "");
                    if (href) offerLink(href, event.clientX, event.clientY);
                  }}
                  onPointerDown={(event) => holdLink(event, safeHref(note.url ?? ""))}
                >
                  {previewImage && (
                    <img
                      src={previewImage}
                      alt=""
                      draggable={false}
                      className="h-14 w-24 shrink-0 rounded-md object-cover"
                      onError={(event) => {
                        event.currentTarget.remove();
                      }}
                    />
                  )}
                  <span className="min-w-0">
                    {note.preview?.site && (
                      <span className="block text-xs font-semibold tracking-wide text-muted uppercase">{note.preview.site}</span>
                    )}
                    {note.preview?.line && <span className="block truncate">{note.preview.line}</span>}
                  </span>
                </button>
              )}
              <button
                type="button"
                data-no-press
                className="break-all rounded-md border border-border bg-bg px-2 py-1.5 text-left font-mono text-xs text-fg select-none"
                style={{ fontFamily: '"Monaspace Neon Var", ui-monospace, monospace', WebkitTouchCallout: "none" }}
                aria-label={t("Share or copy link")}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const href = safeHref(note.url ?? "");
                  if (href) offerLink(href, event.clientX, event.clientY);
                }}
                onPointerDown={(event) => holdLink(event, safeHref(note.url ?? ""))}
              >
                {safeHref(note.url ?? "")}
              </button>
            </div>
          )}
          {note.type === "quotation" && !quotationFaces(note).showOriginal && note.sources && note.sources.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-border pt-2">
              {note.sources.map((source) => {
                const line = formatSource(source);
                const href = safeHref(source.url);
                if (!line && !href) return null;
                return href ? (
                  <a
                    key={source.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    data-no-press
                    className="text-xs text-pretty text-primary"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {line || href}
                  </a>
                ) : (
                  <p key={source.id} className="text-xs text-pretty text-muted">
                    {line}
                  </p>
                );
              })}
            </div>
          )}
          </div>
          {!plain && (
          <div className={cn("card-foot mt-2 flex min-w-0 flex-wrap items-center gap-1.5", note.type !== "quotation" && "card-foot-full")}>
              {note.tags.length === 0 ? (
                <span className="text-xs text-muted tabular-nums" title={recorded}>
                  {formatRecorded(note.edited)}
                </span>
              ) : (
                note.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    data-no-press
                    className="tag-toggle rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleTag(tag);
                    }}
                  >
                    <Highlight text={tag} query={query} />
                  </button>
                ))
              )}
          </div>
          )}
        </div>
        {(note.type === "quotation" || plain) && (
        <div className="relative w-11 shrink-0">
          {note.type === "quotation" && (
            <button
              type="button"
              data-no-press
              className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-fg"
              aria-label={t("Share quotation")}
              onClick={(event) => {
                event.stopPropagation();
                void shareQuotation(note).then(
                  (result) => {
                    if (result === "copied") toast.success(t("Quotation copied"));
                  },
                  () => toast.error(t("Could not share that quotation")),
                );
              }}
            >
              <Share2 className="size-4" />
            </button>
          )}
          {plain && (
          <button
            type="button"
            data-no-press
            className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-fg"
            aria-label={t("Edit note")}
            onClick={(event) => {
              event.stopPropagation();
              onEdit(note.id);
            }}
          >
            <MoreVertical className="size-4" />
          </button>
          )}
        </div>
        )}
        {!plain && (
          <span className="pointer-events-none absolute right-2 bottom-3 text-xs font-semibold tracking-wide text-muted uppercase">
            {typeLabel(note.type)}
          </span>
        )}
      </div>
    </article>
    {linkMenu &&
      createPortal(
        <div className="fixed inset-0 z-[80]" onPointerDown={() => setLinkMenu(null)}>
          <div
            role="menu"
            className="fixed z-[81] w-40 overflow-hidden rounded-xl border border-border bg-surface lift"
            style={{ left: linkMenu.left, top: linkMenu.top }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-3 text-left text-sm font-semibold text-fg hover:bg-bg"
              onClick={() => {
                const href = linkMenu.href;
                setLinkMenu(null);
                void navigator.clipboard?.writeText(href).then(
                  () => toast.success(t("Link copied")),
                  () => toast.error(t("Could not copy that link")),
                );
              }}
            >
              {t("Copy")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full border-t border-border px-4 py-3 text-left text-sm font-semibold text-fg hover:bg-bg"
              onClick={() => {
                const href = linkMenu.href;
                setLinkMenu(null);
                window.open(href, "_blank", "noopener,noreferrer");
              }}
            >
              {t("Open")}
            </button>
            {onMobile() && typeof navigator.share === "function" && (
              <button
                type="button"
                role="menuitem"
                className="block w-full border-t border-border px-4 py-3 text-left text-sm font-semibold text-fg hover:bg-bg"
                onClick={() => {
                  const href = linkMenu.href;
                  setLinkMenu(null);
                  void navigator.share({ url: href }).catch((error: unknown) => {
                    if (error instanceof DOMException && error.name === "AbortError") return;
                    toast.error(t("Could not share that link"));
                  });
                }}
              >
                {t("Share")}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function MediaFactsLine({ facts }: { facts: Note["imageFacts"] }) {
  const line = mediaLine(facts);
  const href = facts?.url && safeHref(facts.url);
  if (!line && !href) return null;
  return (
    <p className="mb-3 text-xs text-pretty text-muted" data-no-press>
      {line}
      {href ? (
        <>
          {line ? " · " : ""}
          <a href={href} target="_blank" rel="noreferrer" className="font-mono text-primary" onClick={(event) => event.stopPropagation()}>
            {facts?.url?.replace(/^https?:\/\//, "")}
          </a>
        </>
      ) : null}
    </p>
  );
}

function QuotationBody({ note, query }: { note: Note; query: string }) {
  const faces = quotationFaces(note);
  const cite = quotationCite(note);
  const language = faces.originalLanguage ? languageName(faces.originalLanguage) : "";
  const label = language ? `Original (${language})` : "Original";
  return (
    <div className="flex flex-col gap-3">
      <QuotationText text={clip(faces.primary)} query={query} />
      {faces.translator ? <p className="text-sm text-muted">Translated by {faces.translator}</p> : null}
      {faces.showOriginal && (
        <div>
          <p className="mb-1 text-sm text-pretty text-muted">
            {label}
            {cite.text ? (
              cite.href ? (
                <>
                  {" — "}
                  <a
                    href={cite.href}
                    target="_blank"
                    rel="noreferrer"
                    data-no-press
                    className="text-primary"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {cite.text}
                  </a>
                </>
              ) : (
                ` — ${cite.text}`
              )
            ) : null}
          </p>
          <QuotationText text={clip(faces.original)} query={query} />
        </div>
      )}
    </div>
  );
}

function quotationCite(note: Note) {
  const listed = (note.sources ?? [])
    .map((source) => ({ text: formatSource(source), href: safeHref(source.url) }))
    .filter((item) => item.text);
  if (listed.length > 0) {
    return { text: listed.map((item) => item.text).join("; "), href: listed.length === 1 ? listed[0].href : "" };
  }
  const author = (note.statements ?? []).find((item) => item.property.trim().toLowerCase() === "author")?.value.trim() ?? "";
  return { text: author, href: "" };
}

function QuotationText({ text, query }: { text: string; query: string }) {
  const trimmed = text.trim();
  const marked = /^[“"«„]/.test(trimmed) && /[”"»]$/.test(trimmed);
  return (
    <span>
      {!marked && (
        <span className="mr-0.5 text-primary" aria-hidden>
          “
        </span>
      )}
      <Highlight text={text} query={query} />
      {!marked && (
        <span className="text-primary" aria-hidden>
          ”
        </span>
      )}
    </span>
  );
}
