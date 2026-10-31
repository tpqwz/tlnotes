import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  buildRows,
  getEndDate,
  periodLineLabel,
  safeColor,
  type Note,
} from "@/lib/tl/model";
import { cn, Highlight } from "@/components/tl/ui";
import { t } from "@/lib/tl/i18n";
import { NoteCard } from "@/components/tl/note-card";

type Span = {
  id: string;
  top: number;
  height: number;
  rule: number;
  color: string;
  label: string;
  ended: boolean;
  lane: number;
};

export function Timeline({
  notes,
  query,
  flashId,
  scopeCollapsed,
  rightHanded,
  showPeriodHint,
  onEdit,
  onTrash,
  onToggleTag,
  onToggleDone,
  onHold,
  onSweep,
  onClear,
  picked,
  picking,
  flat,
}: {
  notes: Note[];
  query: string;
  flashId: string | null;
  scopeCollapsed: boolean;
  rightHanded: boolean;
  showPeriodHint: boolean;
  onEdit: (id: string) => void;
  onTrash: (id: string) => void;
  onToggleTag: (tag: string) => void;
  onToggleDone: (id: string) => void;
  onHold?: (id: string) => void;
  onSweep?: (id: string) => void;
  onClear?: () => void;
  picked?: string[];
  picking?: boolean;
  flat?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const swept = useRef(false);
  const pickedNow = useRef(picked);
  pickedNow.current = picked;
  const [layout, setLayout] = useState<{ spans: Span[]; nowTop: number | null }>({ spans: [], nowTop: null });
  function arm(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!onHold || event.button !== 0) return;
    held.current = false;
    const node = event.currentTarget;
    const pointerId = event.pointerId;
    const move = (ev: PointerEvent) => {
      if (!held.current || !onSweep) return;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-pick-id]")?.getAttribute("data-pick-id");
      if (!hit) return;
      swept.current = true;
      onSweep(hit);
    };
    const timer = window.setTimeout(() => {
      held.current = true;
      onHold(id);
      try {
        node.setPointerCapture(pointerId);
      } catch {
        /* the press already ended */
      }
      node.addEventListener("pointermove", move);
    }, 500);
    const clear = () => {
      window.clearTimeout(timer);
      node.removeEventListener("pointermove", move);
    };
    event.currentTarget.addEventListener("pointerup", clear, { once: true });
    event.currentTarget.addEventListener("pointercancel", clear, { once: true });
  }

  function openNote(id: string) {
    if (held.current || swept.current) {
      held.current = false;
      swept.current = false;
      return;
    }
    if (picking) {
      if (picked?.includes(id)) onHold?.(id);
      else onSweep?.(id);
      return;
    }
    onEdit(id);
  }

  useEffect(() => {
    if (!picking || !onSweep) return;
    let gesture: { id: number; x: number; y: number; at: number; timer: number; armed: boolean } | null = null;

    function pickAt(x: number, y: number) {
      const id = document.elementFromPoint(x, y)?.closest("[data-pick-id]")?.getAttribute("data-pick-id");
      if (id) onSweep?.(id);
    }

    function onDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(".pick-bar, #tl-composer")) return;
      const card = target.closest("[data-pick-id]");
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: Date.now(),
        armed: false,
        timer: window.setTimeout(() => {
          if (!gesture || !card) return;
          gesture.armed = true;
          const node = card as HTMLElement;
          const pointerId = event.pointerId;
          try {
            node.setPointerCapture(pointerId);
          } catch {
            /* the press already ended */
          }
        }, 220),
      };
    }

    function onMove(event: PointerEvent) {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dist = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      if (!gesture.armed) {
        if (dist > 10) {
          window.clearTimeout(gesture.timer);
          gesture = null;
        }
        return;
      }
      if (dist < 8) return;
      swept.current = true;
      pickAt(gesture.x, gesture.y);
      pickAt(event.clientX, event.clientY);
    }

    function onUp(event: PointerEvent) {
      if (!gesture || gesture.id !== event.pointerId) return;
      window.clearTimeout(gesture.timer);
      const didSweep = swept.current;
      const target = event.target instanceof Element ? event.target : null;
      gesture = null;
      if (didSweep) {
        window.setTimeout(() => {
          swept.current = false;
        }, 0);
        return;
      }
      if (!target || target.closest(".pick-bar, #tl-composer")) return;
      const card = target.closest("[data-pick-id]");
      if (card) {
        const id = card.getAttribute("data-pick-id");
        if (id && !pickedNow.current?.includes(id)) onSweep?.(id);
        return;
      }
      onClear?.();
    }

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      if (gesture) window.clearTimeout(gesture.timer);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onClear, onSweep, picking]);

  const rows = buildRows(notes);
  const layoutKey = rows
    .map((row) => (row.kind === "note" ? `${row.note.id}:${row.note.edited}:${row.note.type}` : row.key))
    .join("|");

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const listRect = list.getBoundingClientRect();
      const positions = new Map<string, { top: number; bottom: number; rule: number }>();
      list.querySelectorAll<HTMLElement>("[data-note-id]").forEach((element) => {
        const id = element.dataset.noteId;
        if (!id) return;
        const rect = element.getBoundingClientRect();
        positions.set(id, {
          top: Math.round(rect.top - listRect.top),
          bottom: Math.round(rect.bottom - listRect.top),
          rule: Math.round(rect.top - listRect.top + rect.height / 2),
        });
      });

      const ends = new Map<string, number>();
      list.querySelectorAll<HTMLElement>("[data-period-end]").forEach((element) => {
        const id = element.dataset.periodEnd;
        if (!id) return;
        const rect = element.getBoundingClientRect();
        ends.set(id, Math.round(rect.top - listRect.top + rect.height / 2));
      });

      const nowEl = list.querySelector<HTMLElement>("[data-now]");
      const nowTop = nowEl
        ? Math.round(nowEl.getBoundingClientRect().top - listRect.top + nowEl.offsetHeight / 2)
        : null;

      const periods = notes.filter((note) => note.type === "period" && positions.has(note.id));
      const drafts: Omit<Span, "lane">[] = [];
      for (const period of periods) {
        const pos = positions.get(period.id);
        if (!pos) continue;
        const end = getEndDate(period) ?? Number.POSITIVE_INFINITY;
        const endRule = ends.get(period.id);
        const ended = end !== Number.POSITIVE_INFINITY && endRule != null;
        const bottom = ended ? endRule : Math.max(pos.bottom + 88, list.offsetHeight - 12);
        const content = period.content.replace(/\s+/g, " ").trim();
        drafts.push({
          id: period.id,
          top: pos.rule,
          height: Math.max(bottom - pos.rule, 12),
          rule: pos.rule,
          color: safeColor(period.color),
          label: content.length > 80 ? `${content.slice(0, 80)}…` : content,
          ended,
        });
      }

      drafts.sort((a, b) => a.top - b.top || a.height - b.height);
      const laneEnds: number[] = [];
      const next: Span[] = drafts.map((span) => {
        let lane = laneEnds.findIndex((end) => end <= span.top + 2);
        const bottom = span.top + span.height;
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(bottom);
        } else {
          laneEnds[lane] = bottom;
        }
        return { ...span, lane };
      });

      setLayout((current) =>
        sameSpans(current.spans, next) && current.nowTop === nowTop ? current : { spans: next, nowTop },
      );
    };

    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  }, [layoutKey, notes, scopeCollapsed, rightHanded]);

  const spans = layout.spans;
  const nowTop = layout.nowTop;
  const laneCount = spans.reduce((max, span) => Math.max(max, span.lane + 1), 1);
  const laneShare = 100 / laneCount;

  if (flat) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        {notes.length === 0 ? (
          <p className="pt-8 text-sm text-pretty text-muted">{t("Nothing in this view matches.")}</p>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              query={query}
              flash={flashId === note.id}
              onEdit={onEdit}
              onTrash={onTrash}
              onToggleTag={onToggleTag}
              onToggleDone={onToggleDone}
              onHold={onHold}
              onSweep={onSweep}
              selected={picked?.includes(note.id)}
              picking={picking}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      {showPeriodHint && (
        <p className="mb-4 text-sm text-pretty text-muted">
          {t("None of these are periods yet. Edit a note and set its type to Period to draw a line beside the days it covers.")}
        </p>
      )}
      <div className={cn("relative flex items-stretch", !rightHanded && "flex-row-reverse")}>
        <div ref={listRef} data-gutter={!scopeCollapsed ? (rightHanded ? "right" : "left") : undefined} className="relative z-1 flex min-w-0 flex-1 flex-col pb-28">
          {rows.map((row, index) => {
            if (row.kind === "year") {
              return (
                <h2
                  key={row.key}
                  data-mark="year"
                  data-label={row.label}
                  className={cn("mb-1 font-display text-4xl leading-none text-fg", index > 0 && "mt-8")}
                >
                  {row.label}
                </h2>
              );
            }
            if (row.kind === "month") {
              return (
                <h3
                  key={row.key}
                  data-mark="month"
                  data-label={row.label}
                  className="mt-3 mb-1 font-display text-xl leading-none text-fg"
                >
                  {row.label}
                </h3>
              );
            }
            if (row.kind === "day") {
              return (
                <p
                  key={row.key}
                  data-mark="day"
                  data-day={row.day}
                  className="mt-2 mb-1 text-sm font-medium text-muted"
                >
                  {row.label}
                </p>
              );
            }
            if (row.kind === "now") {
              return (
                <div key={row.key} data-now className="mb-3 flex items-center gap-3">
                  <span className="rule flex-1 bg-primary" />
                  <span className="text-xs font-semibold tracking-widest text-primary uppercase">{t("Now")}</span>
                </div>
              );
            }
            if (row.kind === "periodEnd") {
              const color = safeColor(row.note.color);
              return (
                <div key={row.key} data-period-end={row.note.id} className="mb-3">
                  <button
                    type="button"
                    aria-label={`Edit the end of ${row.note.content}`}
                    className={cn("relative flex h-6 w-full items-center", picked?.includes(row.note.id) && "note-picked")}
                    data-pick-id={row.note.id}
                    onPointerDown={(event) => arm(row.note.id, event)}
                    onClick={() => openNote(row.note.id)}
                  >
                    <span className="rule absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ background: color }} />
                  </button>
                </div>
              );
            }
            if (row.note.type === "period") {
              const color = safeColor(row.note.color);
              const label = periodLineLabel(row.note);
              return (
                <div key={row.key} data-note-id={row.note.id} className={cn("mb-3", flashId === row.note.id && "note-flash")}>
                  <button
                    type="button"
                    title={row.note.content}
                    aria-label={`Edit period: ${label}`}
                    className={cn("relative flex h-6 w-full items-center", picked?.includes(row.note.id) && "note-picked")}
                    data-pick-id={row.note.id}
                    onPointerDown={(event) => arm(row.note.id, event)}
                    onClick={() => openNote(row.note.id)}
                  >
                    <span className="rule absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ background: color }} />
                    <span className="relative mx-auto max-w-[75%] truncate bg-bg px-3 text-xs font-semibold tracking-wide" style={{ color }}>
                      <Highlight text={label} query={query} />
                    </span>
                  </button>
                </div>
              );
            }
            return (
              <div key={row.key} className={cn("mb-3", rightHanded ? "mr-3" : "ml-3")}>
                <NoteCard
                  note={row.note}
                  query={query}
                  flash={flashId === row.note.id}
                  onEdit={onEdit}
                  onTrash={onTrash}
                  onToggleTag={onToggleTag}
                  onToggleDone={onToggleDone}
                  onHold={onHold}
              onSweep={onSweep}
                  selected={picked?.includes(row.note.id)}
                  picking={picking}
                />
              </div>
            );
          })}
        </div>
        {!scopeCollapsed && (
          <div
            className={cn(
              "scope-rail relative z-1 shrink-0 bg-rail",
              rightHanded ? "border-l border-border" : "border-r border-border",
            )}
            aria-label="Scope"
          >
            {nowTop != null && (
              <span className="rule pointer-events-none absolute inset-x-0 z-2 -translate-y-1/2 bg-primary" style={{ top: nowTop }} />
            )}
            {spans.map((span) => (
              <span key={`${span.id}-rail`} className="pointer-events-none">
                <i
                  className="rule absolute inset-x-0 z-2 -translate-y-1/2"
                  style={{ top: span.rule, background: span.color }}
                />
                {span.ended && (
                  <i
                    className="rule absolute inset-x-0 z-2 -translate-y-1/2"
                    style={{ top: span.top + span.height, background: span.color }}
                  />
                )}
              </span>
            ))}
            {spans.map((span) => (
              <button
                key={span.id}
                type="button"
                className="group absolute"
                style={{ top: span.top, height: span.height, width: `${laneShare}%`, left: `${span.lane * laneShare}%` }}
                title={span.ended ? span.label : `${span.label} · ongoing`}
                aria-label={`Edit period: ${span.label}`}
                onClick={() => onEdit(span.id)}
              >
                <span
                  className="rule-y absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full"
                  style={{ background: span.color }}
                />
                <span
                  className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                  style={{ background: span.color }}
                />
                {span.ended && (
                  <span
                    className="absolute bottom-0 left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-surface"
                    style={{ background: span.color }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function sameSpans(current: Span[], next: Span[]) {
  if (current.length !== next.length) return false;
  return current.every((span, index) => {
    const other = next[index];
    return (
      other &&
      span.id === other.id &&
      span.top === other.top &&
      span.height === other.height &&
      span.rule === other.rule &&
      span.lane === other.lane &&
      span.color === other.color &&
      span.ended === other.ended
    );
  });
}
