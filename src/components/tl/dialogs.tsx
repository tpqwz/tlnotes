import { useEffect, useRef, useState } from "react";
import {
  ALL_TYPES,
  BOOK_FORMS,
  CORE_TYPES,
  DEFAULT_PERIOD_COLOR,
  DESIGNATIONS,
  PAGE_TYPES,
  PERIOD_COLORS,
  TIMELINE_TYPES,
  collectTags,
  formatRecorded,
  isSpan,
  isPageType,
  partialFields,
  readPartial,
  safeColor,
  tidyUrl,
  linkPreview,
  cleanMediaFacts,
  typeLabel,
  type Filters,
  type Book,
  type EntityLabel,
  type MediaFacts,
  type Note,
  type QuotationLanguage,
  type QuotationSource,
  type Statement,
} from "@/lib/tl/model";
import { notesToIcs } from "@/lib/tl/ics";
import { downloadText } from "@/lib/tl/storage";
import { compressImage, compressVideo } from "@/lib/tl/media";
import { ingestAddress } from "@/lib/tl/watch";
import { formatUiDate } from "@/lib/tl/language";
import { Modal, btnGhost, btnInk, btnPrimary, btnSurface, cn } from "@/components/tl/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { t, tLine } from "@/lib/tl/i18n";

type FormState = {
  content: string;
  tags: string[];
  type: string;
  year: string;
  month: string;
  day: string;
  beginYear: string;
  beginMonth: string;
  beginDay: string;
  endYear: string;
  endMonth: string;
  endDay: string;
  color: string;
  done: boolean;
  url: string;
  image: string;
  video: string;
  imageFacts: MediaFacts;
  videoFacts: MediaFacts;
  sources: QuotationSource[];
  originalLanguage: string;
  languages: QuotationLanguage[];
  labels: EntityLabel[];
  description: string;
  designation: string;
  statements: Statement[];
  book: Book;
};

function emptyBook(): Book {
  return {
    subtitle: "",
    authors: [],
    translators: [],
    language: "",
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

function fromNote(note: Note): FormState {
  const single = note.date && !isSpan(note.date) ? partialFields(note.date) : partialFields(null);
  const begin = note.date && isSpan(note.date) ? partialFields(note.date.begin) : partialFields(null);
  const end = note.date && isSpan(note.date) ? partialFields(note.date.end) : partialFields(null);
  return {
    content: note.content,
    tags: [...note.tags],
    type: note.type === "idea" ? "note" : note.type,
    year: single.year,
    month: single.month,
    day: single.day,
    beginYear: begin.year,
    beginMonth: begin.month,
    beginDay: begin.day,
    endYear: end.year,
    endMonth: end.month,
    endDay: end.day,
    color: safeColor(note.color),
    done: note.done === true,
    url: note.url ?? "",
    image: note.image ?? "",
    video: note.video ?? "",
    imageFacts: { ...note.imageFacts },
    videoFacts: { ...note.videoFacts },
    sources: note.sources?.map((source) => ({ ...source })) ?? [],
    originalLanguage: note.originalLanguage ?? "",
    languages: note.languages?.map((language) => ({ ...language })) ?? [],
    labels: (note.labels ?? []).map((label) => ({ ...label })),
    description: note.description ?? "",
    designation: note.designation ?? "",
    statements: (note.statements ?? []).map((item) => ({ ...item, qualifiers: item.qualifiers.map((qualifier) => ({ ...qualifier })) })),
    book: { ...emptyBook(), ...note.book, authors: [...(note.book?.authors ?? [])], translators: [...(note.book?.translators ?? [])], subjects: [...(note.book?.subjects ?? [])] },
  };
}

export function EditorDialog({
  note,
  corpus,
  onClose,
  onSave,
  onTrash,
}: {
  note: Note | null;
  corpus: Note[];
  onClose: () => void;
  onSave: (note: Note) => void;
  onTrash: (id: string) => void;
}) {
  const [form, setForm] = useState<FormState | null>(note ? fromNote(note) : null);
  const [tagDraft, setTagDraft] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);

  useEffect(() => {
    setForm(note ? fromNote(note) : null);
    setTagDraft("");
    setTagsOpen(false);
  }, [note]);

  if (!form || !note) {
    return (
      <Modal open={false} onOpenChange={() => onClose()} title={t("Edit note")}>
        <span />
      </Modal>
    );
  }

  const family = isPageType(form.type) ? PAGE_TYPES : TIMELINE_TYPES;
  const typeOptions: string[] = [...family].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)));
  if (!typeOptions.includes(form.type)) typeOptions.push(form.type);
  const existing = collectTags(corpus).filter((tag) => !form.tags.includes(tag));
  const showPoint = !isPageType(form.type) && form.type !== "draft" && form.type !== "period";
  const showPeriod = form.type === "period";
  const draft = form;
  const source = note;

  function save() {
    const next = built();
    if (next) onSave(next);
  }

  function addToCalendar() {
    const next = built();
    if (!next) return;
    downloadText("tlnotes.ics", notesToIcs([next]), "text/calendar");
  }

  function built(): Note | null {
    const content = draft.content.trim();
    if (!content && !draft.image.trim() && !draft.video.trim()) return null;
    const next: Note = {
      ...source,
      content,
      type: draft.type,
      tags: draft.tags,
      edited: Date.now(),
      date: null,
    };
    if (draft.type === "draft") {
      next.date = null;
    } else if (draft.type === "period") {
      next.date = {
        begin: readPartial(draft.beginYear, draft.beginMonth, draft.beginDay),
        end: readPartial(draft.endYear, draft.endMonth, draft.endDay),
      };
      next.color = safeColor(draft.color);
    } else {
      next.date = readPartial(draft.year, draft.month, draft.day);
    }
    if (draft.type === "task") next.done = draft.done;
    else delete next.done;
    if (draft.type === "link") {
      next.url = tidyUrl(draft.url);
      const same = tidyUrl(note?.url ?? "") === next.url;
      if (same && note?.preview?.kept) next.preview = note.preview;
      else {
        const preview = linkPreview(next.url);
        if (preview) next.preview = preview;
        else delete next.preview;
      }
    } else {
      delete next.url;
      delete next.preview;
    }
    if (draft.type === "quotation") {
      const sources = draft.sources.filter((source) =>
        [source.author, source.work, source.container, source.edition, source.locator, source.published, source.url].some(
          (part) => part.trim() !== "",
        ),
      );
      if (sources.length > 0) next.sources = sources.map((source) => ({ ...source, url: tidyUrl(source.url) }));
      else delete next.sources;
      const originalLanguage = draft.originalLanguage.trim();
      if (originalLanguage) next.originalLanguage = originalLanguage;
      else delete next.originalLanguage;
      const languages = draft.languages
        .filter((language) => language.language.trim() || language.text.trim())
        .map((language) => {
          const translator = language.translator?.trim() ?? "";
          const next = { id: language.id, language: language.language.trim(), text: language.text.trim() };
          return translator ? { ...next, translator } : next;
        });
      if (languages.length > 0) next.languages = languages;
      else delete next.languages;
      delete next.labels;
      delete next.description;
      delete next.designation;
      delete next.statements;
      delete next.book;
    } else {
      delete next.sources;
      delete next.originalLanguage;
      delete next.languages;
    }
    if (isPageType(draft.type)) {
      const labels = draft.labels.map((label) => ({ text: label.text.trim(), language: label.language.trim() })).filter((label) => label.text);
      if (labels.length > 0) next.labels = labels;
      else delete next.labels;
      const description = draft.description.trim();
      if (description) next.description = description;
      else delete next.description;
      const designation = draft.designation.trim();
      if (designation) next.designation = designation;
      else delete next.designation;
      const statements = draft.statements.filter((item) => item.property.trim() && item.value.trim());
      if (statements.length > 0) next.statements = statements;
      else delete next.statements;
      if (draft.type === "book") {
        const book = {
          ...draft.book,
          subtitle: draft.book.subtitle.trim(),
          language: draft.book.language.trim(),
          originalTitle: draft.book.originalTitle.trim(),
          originalLanguage: draft.book.originalLanguage.trim(),
          form: draft.book.form.trim(),
          publisher: draft.book.publisher.trim(),
          place: draft.book.place.trim(),
          published: draft.book.published.trim(),
          edition: draft.book.edition.trim(),
          isbn: draft.book.isbn.trim(),
          authors: draft.book.authors.map((item) => item.trim()).filter(Boolean),
          translators: draft.book.translators.map((item) => item.trim()).filter(Boolean),
          subjects: draft.book.subjects.map((item) => item.trim()).filter(Boolean),
        };
        if (Object.values(book).some((item) => (Array.isArray(item) ? item.length > 0 : item !== ""))) next.book = book;
        else delete next.book;
      } else delete next.book;
    } else {
      delete next.labels;
      delete next.description;
      delete next.designation;
      delete next.statements;
      delete next.book;
    }
    const image = draft.image.trim();
    if (image.startsWith("data:image/") || /^https:\/\//.test(image)) next.image = image;
    else delete next.image;
    const video = draft.video.trim();
    if (video.startsWith("data:video/") || video.startsWith("data:audio/") || /^https:\/\//.test(video)) next.video = video;
    else delete next.video;
    const imageFacts = cleanMediaFacts(draft.imageFacts);
    const videoFacts = cleanMediaFacts(draft.videoFacts);
    if (next.image && imageFacts) next.imageFacts = imageFacts;
    else delete next.imageFacts;
    if (next.video && videoFacts) next.videoFacts = videoFacts;
    else delete next.videoFacts;
    return next;
  }

  function patch(partial: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...partial } : current));
  }

  function setType(type: string) {
    setForm((current) => {
      if (!current) return current;
      if (type === "period" && current.type !== "period") {
        return {
          ...current,
          type,
          beginYear: current.beginYear || current.year,
          beginMonth: current.beginMonth || current.month,
          beginDay: current.beginDay || current.day,
        };
      }
      if (type !== "period" && current.type === "period") {
        return {
          ...current,
          type,
          year: current.year || current.beginYear,
          month: current.month || current.beginMonth,
          day: current.day || current.beginDay,
        };
      }
      return { ...current, type };
    });
  }

  function addTag(value?: string) {
    const next = (value ?? tagDraft).trim();
    if (!next) return;
    setForm((current) => {
      if (!current || current.tags.includes(next)) return current;
      return { ...current, tags: [...current.tags, next] };
    });
    setTagDraft("");
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={typeLabel(form.type)}
      description={form.type && TYPE_HINT[form.type] ? t(TYPE_HINT[form.type]) : ""}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t("Type")}
          <select className="field" value={form.type} onChange={(event) => setType(event.target.value)}>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {contentLabel(form.type)}
          <textarea
            className="field min-h-40"
            value={form.content}
            placeholder={contentPlaceholder(form.type)}
            onChange={(event) => patch({ content: event.target.value })}
          />
        </label>

        <MediaFields
          image={form.image}
          video={form.video}
          imageFacts={form.imageFacts}
          videoFacts={form.videoFacts}
          showPicture={form.type === "image" || Boolean(form.image)}
          showClip={form.type === "video" || Boolean(form.video)}
          onChange={(next) => patch(next)}
        />

        {form.type === "link" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
            {t("Address")}
            <input
              className="field"
              inputMode="url"
              placeholder="https://"
              value={form.url}
              onChange={(event) => patch({ url: event.target.value })}
            />
          </label>
        )}

        {form.type === "task" && (
          <label className="inline-flex h-11 items-center gap-2 text-sm font-medium text-fg">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.done}
              onChange={(event) => patch({ done: event.target.checked })}
            />
            {t("Done")}
          </label>
        )}

        {form.type === "quotation" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t("Original language")}
              <input
                className="field"
                placeholder={t("The language these words were written in")}
                value={form.originalLanguage}
                onChange={(event) => patch({ originalLanguage: event.target.value })}
              />
            </label>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-fg">{t("Other languages")}</p>
              {form.languages.map((language, index) => (
                <div key={language.id} className="flex flex-col gap-2 rounded-xl bg-bg px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t("Language {n}", { n: index + 1 })}</p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted"
                      onClick={() => patch({ languages: form.languages.filter((item) => item.id !== language.id) })}
                    >
                      {t("Remove")}
                    </button>
                  </div>
                  <input
                    className="field"
                    aria-label={t("Language {n}", { n: index + 1 })}
                    placeholder={t("Language")}
                    value={language.language}
                    onChange={(event) =>
                      patch({
                        languages: form.languages.map((item) =>
                          item.id === language.id ? { ...item, language: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  <textarea
                    className="field"
                    aria-label={t("Words in language {n}", { n: index + 1 })}
                    placeholder={t("The words in this language")}
                    value={language.text}
                    onChange={(event) =>
                      patch({
                        languages: form.languages.map((item) =>
                          item.id === language.id ? { ...item, text: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  <input
                    className="field"
                    aria-label={t("Translator of language {n}", { n: index + 1 })}
                    placeholder={t("Translator, if this wording is a translation")}
                    value={language.translator ?? ""}
                    onChange={(event) =>
                      patch({
                        languages: form.languages.map((item) =>
                          item.id === language.id ? { ...item, translator: event.target.value } : item,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="self-start text-sm font-semibold text-primary"
                onClick={() => patch({ languages: [...form.languages, blankLanguage()] })}
              >
                {t("Add a language")}
              </button>
            </div>
            {form.sources.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-fg">{t("Sources")}</p>
                {form.sources.map((source, index) => (
                  <SourceFields
                    key={source.id}
                    source={source}
                    index={index}
                    onChange={(next) =>
                      patch({ sources: form.sources.map((item) => (item.id === source.id ? next : item)) })
                    }
                    onRemove={() => patch({ sources: form.sources.filter((item) => item.id !== source.id) })}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              className="self-start text-sm font-semibold text-primary"
              onClick={() => patch({ sources: [...form.sources, blankSource()] })}
            >
              {form.sources.length === 0 ? t("Add a source") : t("Add another source")}
            </button>
          </div>
        )}

        {(form.type === "page" || form.type === "headword" || form.type === "persona" || form.type === "book") && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t("Designation")}
              <select className="field" value={form.designation} onChange={(event) => patch({ designation: event.target.value })}>
                <option value="">{t("None")}</option>
                {DESIGNATIONS.map((item) => (
                  <option key={item} value={item}>
                    {t(item)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-pretty text-muted">
              {form.type === "headword"
                ? t("The first title is the headword. Another title may be another form, or the same word in another language.")
                : form.type === "persona"
                  ? t("A person, kept in the repertorium. The title is the name.")
                  : form.type === "book"
                    ? t("A book. The title is its name. Authors and subjects are names of other pages.")
                    : t("MyST. A cross-reference is {doc}`Another page` or [[Another page]]. A note begins with :::{note}.")}
            </p>
            <input className="field" placeholder={t("A small picture address")} value={form.image} onChange={(event) => patch({ image: event.target.value })} />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t("Description")}
              <input
                className="field"
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-fg">{form.type === "headword" ? t("Headword") : form.type === "persona" ? t("Name") : t("Titles")}</p>
              {form.labels.map((label, index) => (
                <div key={`${label.language}:${label.text}:${index}`} className="flex flex-col gap-2 rounded-xl bg-bg px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{index === 0 ? t("Title") : t("Another title")}</p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted"
                      onClick={() => patch({ labels: form.labels.filter((_, item) => item !== index) })}
                    >
                      {t("Remove")}
                    </button>
                  </div>
                  <input
                    className="field"
                    aria-label={index === 0 ? t("Title") : t("Title {n}", { n: index + 1 })}
                    placeholder={t("The name in this language")}
                    value={label.text}
                    onChange={(event) =>
                      patch({
                        labels: form.labels.map((item, itemIndex) => (itemIndex === index ? { ...item, text: event.target.value } : item)),
                      })
                    }
                  />
                  <input
                    className="field"
                    aria-label={index === 0 ? t("Language of the title") : t("Language of title {n}", { n: index + 1 })}
                    placeholder={t("Language")}
                    value={label.language}
                    onChange={(event) =>
                      patch({
                        labels: form.labels.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, language: event.target.value } : item,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="self-start text-sm font-semibold text-primary"
                onClick={() => patch({ labels: [...form.labels, { text: "", language: "" }] })}
              >
                {t("Add a title")}
              </button>
            </div>
            {form.type === "book" && <BookFields book={form.book} onChange={(book) => patch({ book })} />}
            <StatementFields statements={form.statements} onChange={(statements) => patch({ statements })} />
          </div>
        )}

        {showPoint && (
          <DateFields
            label={dateLabel(form.type)}
            year={form.year}
            month={form.month}
            day={form.day}
            onChange={(partial) => patch(partial)}
          />
        )}

        {showPoint && isFuturePoint(form.year, form.month, form.day) && (
          <p className="text-sm text-pretty text-muted">
            {form.type === "task"
              ? t("That due date is still ahead, so the task sits below the present line.")
              : t("That date is still ahead, so it sits below the present line.")}
          </p>
        )}

        {showPeriod && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <DateFields
                label={t("Begins")}
                year={form.beginYear}
                month={form.beginMonth}
                day={form.beginDay}
                names={{ year: "beginYear", month: "beginMonth", day: "beginDay" }}
                onChange={(partial) => patch(partial)}
              />
              <DateFields
                label={t("Ends")}
                year={form.endYear}
                month={form.endMonth}
                day={form.endDay}
                names={{ year: "endYear", month: "endMonth", day: "endDay" }}
                onChange={(partial) => patch(partial)}
              />
            </div>
            <p className="text-sm text-muted">{t("Leave the end year empty and the line stays open.")}</p>
            <div>
              <p className="text-sm font-medium text-fg">{t("Period color")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {PERIOD_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={t("Color {color}", { color })}
                    className="size-9 rounded-full ring-offset-2 ring-offset-surface"
                    style={{
                      background: color,
                      boxShadow: form.color.toLowerCase() === color ? "0 0 0 2px var(--color-fg)" : undefined,
                    }}
                    onClick={() => patch({ color })}
                  />
                ))}
                <input
                  type="color"
                  aria-label={t("Custom period color")}
                  className="size-9 cursor-pointer rounded-full border border-border bg-transparent"
                  value={safeColor(form.color, DEFAULT_PERIOD_COLOR)}
                  onChange={(event) => patch({ color: event.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg">{t("Tags")}</p>
            <button type="button" className="text-sm font-semibold text-primary" onClick={() => setTagsOpen(true)}>
              {form.tags.length === 0 ? t("Add tags") : t("Edit tags")}
            </button>
          </div>
          {form.tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {form.tags.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    onClick={() => patch({ tags: form.tags.filter((item) => item !== tag) })}
                  >
                    {tag} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Modal open={tagsOpen} level={1} onOpenChange={setTagsOpen} title={t("Tags")} description={t("Add one, or choose from the tags already in the journal.")}>
          <div className="flex gap-2">
            <input
              className="field"
              value={tagDraft}
              placeholder={t("A new tag")}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
            />
            <button type="button" className={btnSurface} onClick={() => addTag()}>
              {t("Add")}
            </button>
          </div>
          {existing.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {existing
                .filter((tag) => tagDraft.trim() === "" || tag.toLowerCase().includes(tagDraft.trim().toLowerCase()))
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-fg"
                    onClick={() => addTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
            </div>
          )}
        </Modal>

        <p className="text-xs text-pretty text-muted">
          {t("Written {when}", { when: formatRecorded(note.created) })}
          {note.edited !== note.created ? ` · ${t("Last edited {when}", { when: formatRecorded(note.edited) })}` : ""}.
          {form.type === "draft" ? "" : ` ${t("Dating it to another year leaves these times as they are.")}`}
        </p>

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <button
              type="button"
              className="text-sm font-semibold text-fg underline decoration-border underline-offset-4"
              onClick={() => onTrash(note.id)}
            >
              {t("Move to trash")}
            </button>
            {draft.type === "event" || draft.type === "task" || draft.type === "period" ? (
              <button type="button" className="text-sm font-semibold text-primary" onClick={addToCalendar}>
                {t("Add to calendar")}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>
              {t("Cancel")}
            </button>
            <button type="submit" className={btnPrimary} disabled={form.content.trim() === "" && form.image.trim() === "" && form.video.trim() === ""}>
              {t("Save")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function MediaFields({
  image,
  video,
  imageFacts,
  videoFacts,
  showPicture,
  showClip,
  onChange,
}: {
  image: string;
  video: string;
  imageFacts: MediaFacts;
  videoFacts: MediaFacts;
  showPicture: boolean;
  showClip: boolean;
  onChange: (next: { image?: string; video?: string; imageFacts?: MediaFacts; videoFacts?: MediaFacts }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const kind = file.type || (/\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(file.name) ? "image/" : /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name) ? "video/" : "");
      if (kind.startsWith("video/")) {
        const kept = await compressVideo(file, file.name);
        onChange({ video: kept.data, videoFacts: { ...kept.facts, name: file.name } });
      } else if (kind.startsWith("image/")) {
        const kept = await compressImage(file, file.name);
        onChange({ image: kept.data, imageFacts: { ...kept.facts, name: file.name } });
      } else setError(t("Choose a picture or a video."));
    } catch (caught) {
      setError(caught instanceof Error ? tLine(caught.message) : t("Could not attach that."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function pull() {
    const target = address.trim();
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const taken = await ingestAddress(target);
      if (!taken) throw new Error(t("That address is not a picture or a video."));
      if (taken.kind === "video") {
        onChange({
          ...(taken.data ? { video: taken.data } : {}),
          ...(taken.poster ? { image: taken.poster } : {}),
          videoFacts: taken.facts,
        });
      } else onChange({ image: taken.data, imageFacts: taken.facts });
      setAddress("");
    } catch (caught) {
      setError(caught instanceof Error ? tLine(caught.message) : t("Could not fetch that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-fg">{t("Picture or clip")}</p>
        <button type="button" className="text-sm font-semibold text-primary disabled:opacity-40" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? t("Working…") : t("Attach")}
        </button>
      </div>
      <div className="flex gap-2">
        <input className="field min-w-0 flex-1" placeholder={t("Or an address to fetch")} value={address} onChange={(event) => setAddress(event.target.value)} />
        <button type="button" className="text-sm font-semibold text-primary disabled:opacity-40" disabled={busy || address.trim() === ""} onClick={() => void pull()}>
          {t("Fetch")}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
      {image ? (
        <div>
          <img src={image} alt="" className="max-h-40 w-full rounded-xl object-cover" />
          <button type="button" className="mt-1 text-xs font-semibold text-muted" onClick={() => onChange({ image: "", imageFacts: {} })}>
            {t("Remove picture")}
          </button>
        </div>
      ) : null}
      {video ? (
        <div>
          <video src={video} controls playsInline className="max-h-48 w-full rounded-xl bg-bg" />
          <button type="button" className="mt-1 text-xs font-semibold text-muted" onClick={() => onChange({ video: "", videoFacts: {} })}>
            {t("Remove clip")}
          </button>
        </div>
      ) : null}
      {showPicture ? <FactFields title={t("Picture")} facts={imageFacts} clip={false} onChange={(imageFacts) => onChange({ imageFacts })} /> : null}
      {showClip ? <FactFields title={t("Clip")} facts={videoFacts} clip onChange={(videoFacts) => onChange({ videoFacts })} /> : null}
      {error ? <p className="text-sm text-muted">{error}</p> : null}
      <p className="text-xs text-pretty text-muted">{t("A large picture or clip is shrunk before it is kept. A clip longer than twenty seconds keeps only the start. Fetching keeps the address, and the file when the site allows it.")}</p>
    </div>
  );
}

function FactFields({
  title,
  facts,
  clip,
  onChange,
}: {
  title: string;
  facts: MediaFacts;
  clip: boolean;
  onChange: (facts: MediaFacts) => void;
}) {
  function set(partial: MediaFacts) {
    onChange({ ...facts, ...partial });
  }
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl bg-bg px-3 py-3">
      <legend className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</legend>
      <input className="field" placeholder={t("Original file name")} value={facts.name ?? ""} onChange={(event) => set({ name: event.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="field" inputMode="numeric" placeholder={t("Width")} aria-label={t("{title} width", { title })} value={facts.width ?? ""} onChange={(event) => set({ width: event.target.value === "" ? undefined : Number(event.target.value) })} />
        <input className="field" inputMode="numeric" placeholder={t("Height")} aria-label={t("{title} height", { title })} value={facts.height ?? ""} onChange={(event) => set({ height: event.target.value === "" ? undefined : Number(event.target.value) })} />
        <input className="field" inputMode="numeric" placeholder={t("Size in bytes")} aria-label={t("{title} size", { title })} value={facts.bytes ?? ""} onChange={(event) => set({ bytes: event.target.value === "" ? undefined : Number(event.target.value) })} />
        {clip ? (
          <input className="field" inputMode="decimal" placeholder={t("Length in seconds")} aria-label={t("Clip length")} value={facts.seconds ?? ""} onChange={(event) => set({ seconds: event.target.value === "" ? undefined : Number(event.target.value) })} />
        ) : null}
      </div>
      <input className="field" placeholder={t("Address it was fetched from")} value={facts.url ?? ""} onChange={(event) => set({ url: event.target.value })} />
    </fieldset>
  );
}

function contentLabel(type: string) {
  if (type === "quotation") return t("Quotation");
  if (type === "link") return t("Title");
  if (type === "dream") return t("Dream");
  if (type === "task") return t("Task");
  if (type === "event") return t("What happened");
  if (type === "period") return t("Period");
  if (type === "book") return t("Book");
  if (type === "persona") return t("Persona");
  if (type === "headword") return t("Entry");
  if (type === "page") return t("Page");
  if (type === "draft") return t("Draft");
  if (type === "image") return t("Caption");
  if (type === "video") return t("Caption");
  return t("Note");
}

function contentPlaceholder(type: string) {
  if (type === "quotation") return t("The words themselves");
  if (type === "link") return t("What to remember");
  if (type === "dream") return t("What you dreamt");
  if (type === "task") return t("What is to be done");
  if (type === "period") return t("The span, in a few words");
  if (type === "book") return t("What the book is, in MyST");
  if (type === "persona") return t("Who they are, in MyST");
  if (type === "headword") return t("The senses, or what you want remembered");
  if (type === "page") return t("The page, in MyST");
  if (type === "image") return t("A few words, if you want");
  if (type === "video") return t("A few words, if you want");
  return "";
}

function dateLabel(type: string) {
  if (type === "task") return t("Due, if you want one");
  if (type === "dream") return t("When it was dreamt");
  if (type === "quotation" || type === "link") return t("When it belongs, if you want");
  if (type === "headword" || type === "page") return t("When it belongs, if you want");
  if (type === "event") return t("When it happened");
  if (type === "image") return t("When it was made, if you want");
  if (type === "video") return t("When it was made, if you want");
  return t("When it belongs");
}

const TYPE_HINT: Record<string, string> = {
  note: "Placed on a day.",
  draft: "Stays at the time you wrote it.",
  event: "Something that happened, or will.",
  period: "A span. It draws a line across the timeline.",
  task: "Something to do. A due date is optional.",
  dream: "Placed on the day it was dreamt.",
  link: "A title and an address.",
  image: "A picture. Words are optional.",
  video: "A clip. Words are optional. The length kept is the start, up to twenty seconds.",
  quotation: "The words, the language, and a source if you have one.",
  page: "A MyST page. Titles are its names, and links are its relations.",
  headword: "One word in the lexicon. The title is the headword.",
  persona: "A person in the repertorium. Not a timeline note.",
  book: "A book. The title is its name. Authors, form, and edition are the record.",
};

function blankLanguage(): QuotationLanguage {
  return { id: crypto.randomUUID(), language: "", text: "", translator: "" };
}

function blankSource(): QuotationSource {
  return { id: crypto.randomUUID(), author: "", work: "", container: "", edition: "", locator: "", published: "", url: "" };
}

function SourceFields({
  source,
  index,
  onChange,
  onRemove,
}: {
  source: QuotationSource;
  index: number;
  onChange: (source: QuotationSource) => void;
  onRemove: () => void;
}) {
  const fields: { key: keyof QuotationSource; label: string }[] = [
    { key: "author", label: t("Author") },
    { key: "work", label: t("Work") },
    { key: "container", label: t("Publication, journal, or site") },
    { key: "edition", label: t("Edition or translation") },
    { key: "locator", label: t("Page, line, or time") },
    { key: "published", label: t("Date of this appearance") },
    { key: "url", label: t("Link to this appearance") },
  ];
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl bg-bg px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-xs font-semibold tracking-wide text-muted uppercase">{t("Source {n}", { n: index + 1 })}</legend>
        <button type="button" className="text-xs font-semibold text-muted" onClick={onRemove}>
          {t("Remove")}
        </button>
      </div>
      {fields.map((field) => (
        <input
          key={field.key}
          className="field"
          aria-label={t("{field} for source {n}", { field: field.label, n: index + 1 })}
          placeholder={field.label}
          value={source[field.key]}
          onChange={(event) => onChange({ ...source, [field.key]: event.target.value })}
        />
      ))}
    </fieldset>
  );
}

function isFuturePoint(year: string, month: string, day: string) {
  if (!year && !month && !day) return false;
  const today = new Date();
  const y = year ? Number(year) : today.getFullYear();
  const m = month ? Number(month) - 1 : year ? 0 : today.getMonth();
  const d = day ? Number(day) : 1;
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return new Date(y, m, d).getTime() > start;
}

function DateFields({
  label,
  year,
  month,
  day,
  names = { year: "year", month: "month", day: "day" },
  onChange,
}: {
  label: string;
  year: string;
  month: string;
  day: string;
  names?: { year: "year" | "beginYear" | "endYear"; month: "month" | "beginMonth" | "endMonth"; day: "day" | "beginDay" | "endDay" };
  onChange: (partial: Partial<FormState>) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg">{label}</legend>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <input
          className="field"
          inputMode="numeric"
          placeholder={t("Year")}
          aria-label={t("{label} year", { label })}
          value={year}
          onChange={(event) => onChange({ [names.year]: event.target.value })}
        />
        <select
          className="field"
          aria-label={t("{label} month", { label })}
          value={month}
          onChange={(event) => onChange({ [names.month]: event.target.value })}
        >
          <option value="">{t("Month")}</option>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={String(index + 1)}>
              {formatUiDate(new Date(2000, index, 1), { month: "long" })}
            </option>
          ))}
        </select>
        <input
          className="field"
          inputMode="numeric"
          placeholder={t("Day")}
          aria-label={t("{label} day", { label })}
          value={day}
          onChange={(event) => onChange({ [names.day]: event.target.value })}
        />
      </div>
    </fieldset>
  );
}

function StatementFields({ statements, onChange }: { statements: Statement[]; onChange: (next: Statement[]) => void }) {
  const [property, setProperty] = useState("");
  const [value, setValue] = useState("");
  const [qualifier, setQualifier] = useState("");
  const [qualifierValue, setQualifierValue] = useState("");
  const [source, setSource] = useState("");

  function add() {
    const name = property.trim();
    const stated = value.trim();
    if (!name || !stated) return;
    onChange([
      ...statements,
      {
        id: crypto.randomUUID(),
        property: name,
        value: stated,
        qualifiers: qualifier.trim() && qualifierValue.trim() ? [{ property: qualifier.trim(), value: qualifierValue.trim() }] : [],
        source: source.trim(),
        sourceUrl: "",
      },
    ]);
    setProperty("");
    setValue("");
    setQualifier("");
    setQualifierValue("");
    setSource("");
  }

  return (
    <div>
      <p className="text-sm font-medium text-fg">{t("Statements")}</p>
      <p className="mt-1 text-sm text-pretty text-muted">{t("A property, a value, and only the qualifier and source that change the claim.")}</p>
      {statements.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {statements.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <span>
                <span className="text-muted">{item.property}.</span> {item.value}
                {item.qualifiers.length > 0 && (
                  <span className="text-muted"> ({item.qualifiers.map((item) => `${item.property}: ${item.value}`).join("; ")})</span>
                )}
                {item.source && <span className="text-muted"> — {item.source}</span>}
              </span>
              <button type="button" className="shrink-0 text-xs font-semibold text-muted" onClick={() => onChange(statements.filter((other) => other.id !== item.id))}>
                {t("Remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input className="field" placeholder={t("Property")} value={property} onChange={(event) => setProperty(event.target.value)} />
        <input className="field" placeholder={t("Value")} value={value} onChange={(event) => setValue(event.target.value)} />
        <input className="field" placeholder={t("Qualifier, if it matters")} value={qualifier} onChange={(event) => setQualifier(event.target.value)} />
        <input className="field" placeholder={t("Qualifier value")} value={qualifierValue} onChange={(event) => setQualifierValue(event.target.value)} />
        <input className="field sm:col-span-2" placeholder={t("Source")} value={source} onChange={(event) => setSource(event.target.value)} />
      </div>
      <button type="button" className={`${btnSurface} mt-2`} onClick={add}>
        {t("Add statement")}
      </button>
    </div>
  );
}

function BookFields({ book, onChange }: { book: Book; onChange: (next: Book) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-fg">{t("The book")}</p>
      <input className="field" placeholder={t("Subtitle")} value={book.subtitle} onChange={(event) => onChange({ ...book, subtitle: event.target.value })} />
      <NameList label={t("Authors")} values={book.authors} placeholder={t("An author")} onChange={(authors) => onChange({ ...book, authors })} />
      <NameList label={t("Translators")} values={book.translators} placeholder={t("A translator")} onChange={(translators) => onChange({ ...book, translators })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="field" placeholder={t("Language")} value={book.language} onChange={(event) => onChange({ ...book, language: event.target.value })} />
        <select className="field" value={book.form} onChange={(event) => onChange({ ...book, form: event.target.value })}>
          <option value="">{t("Form")}</option>
          {BOOK_FORMS.map((form) => (
            <option key={form} value={form}>
              {t(form)}
            </option>
          ))}
        </select>
        <input className="field" placeholder={t("Original title")} value={book.originalTitle} onChange={(event) => onChange({ ...book, originalTitle: event.target.value })} />
        <input className="field" placeholder={t("Original language")} value={book.originalLanguage} onChange={(event) => onChange({ ...book, originalLanguage: event.target.value })} />
        <input className="field" placeholder={t("Published")} value={book.published} onChange={(event) => onChange({ ...book, published: event.target.value })} />
        <input className="field" placeholder={t("Edition")} value={book.edition} onChange={(event) => onChange({ ...book, edition: event.target.value })} />
        <input className="field" placeholder={t("Publisher")} value={book.publisher} onChange={(event) => onChange({ ...book, publisher: event.target.value })} />
        <input className="field" placeholder={t("Place")} value={book.place} onChange={(event) => onChange({ ...book, place: event.target.value })} />
        <input className="field sm:col-span-2" placeholder={t("ISBN, if this is one printing")} value={book.isbn} onChange={(event) => onChange({ ...book, isbn: event.target.value })} />
      </div>
      <NameList label={t("Subjects")} values={book.subjects} placeholder={t("A subject")} onChange={(subjects) => onChange({ ...book, subjects })} />
    </div>
  );
}

function NameList({ label, values, placeholder, onChange }: { label: string; values: string[]; placeholder: string; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const next = draft.trim();
    if (!next || values.includes(next)) return;
    onChange([...values, next]);
    setDraft("");
  }
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      {values.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <button key={value} type="button" className="rounded-full bg-bg px-2.5 py-1 text-sm" onClick={() => onChange(values.filter((item) => item !== value))}>
              {value} ×
            </button>
          ))}
        </div>
      )}
      <div className="mt-1 flex gap-2">
        <input
          className="field"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className={btnSurface} onClick={add}>
          {t("Add")}
        </button>
      </div>
    </div>
  );
}

function FilterChip({
  selected,
  onToggle,
  onOnly,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  onOnly: () => void;
  children: string;
}) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const wait = useRef<number | null>(null);

  function clearHold() {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-11 items-center rounded-full px-3 text-sm",
        selected ? "bg-primary/15 text-fg" : "bg-bg text-muted",
      )}
      onPointerDown={() => {
        held.current = false;
        clearHold();
        timer.current = window.setTimeout(() => {
          held.current = true;
          onOnly();
        }, 450);
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        if (wait.current != null) {
          window.clearTimeout(wait.current);
          wait.current = null;
          onOnly();
          return;
        }
        wait.current = window.setTimeout(() => {
          wait.current = null;
          onToggle();
        }, 260);
      }}
    >
      {children}
    </button>
  );
}

export function FilterDialog({
  open,
  notes,
  filters,
  taskMode = false,
  taskTags = [],
  showDone = false,
  taskSort = "order",
  onClose,
  onApply,
  onApplyTasks,
}: {
  open: boolean;
  notes: Note[];
  filters: Filters;
  taskMode?: boolean;
  taskTags?: string[];
  showDone?: boolean;
  taskSort?: "order" | "edited" | "added";
  onClose: () => void;
  onApply: (filters: Filters) => void;
  onApplyTasks?: (next: { tags: string[]; showDone: boolean; sort: "order" | "edited" | "added" }) => void;
}) {
  const [types, setTypes] = useState(filters.types);
  const [tags, setTags] = useState(taskMode ? taskTags : filters.tags);
  const [done, setDone] = useState(showDone);
  const [sort, setSort] = useState(taskSort);
  const taskNotes = notes.filter((note) => note.type === "task");
  const available = collectTags(taskMode ? taskNotes : notes);
  const presentLegacy = ALL_TYPES.filter(
    (type) => !CORE_TYPES.includes(type as (typeof CORE_TYPES)[number]) && notes.some((note) => note.type === type),
  );
  const typeList = [...TIMELINE_TYPES, ...presentLegacy];

  useEffect(() => {
    if (!open) return;
    setTypes(filters.types);
    setTags(taskMode ? taskTags : filters.tags);
    setDone(showDone);
    setSort(taskSort);
  }, [open, filters, taskMode, taskTags, showDone, taskSort]);

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  const sorts = [
    ["order", t("Order")],
    ["edited", t("Edited")],
    ["added", t("Added")],
  ] as const;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={taskMode ? t("Filter tasks") : t("Filter timeline")}
      seat="low"
      info={
        taskMode
          ? t("A tap adds or removes a tag. A double-tap or a long press keeps only that one. Order is the arrangement you dragged. Edited and Added sort by those times. Done stays hidden until you show it.")
          : t("A tap adds or removes. A double-tap or a long press keeps only that one.")
      }
    >
      {taskMode ? (
        <div>
          <h3 className="text-sm font-semibold text-fg">{t("Sort")}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {sorts.map(([id, label]) => (
              <FilterChip key={id} selected={sort === id} onToggle={() => setSort(id)} onOnly={() => setSort(id)}>
                {label}
              </FilterChip>
            ))}
          </div>
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-fg">{t("Done")}</h3>
            <div className="mt-2">
              <FilterChip selected={done} onToggle={() => setDone((current) => !current)} onOnly={() => setDone(true)}>
                {done ? t("Showing done") : t("Hiding done")}
              </FilterChip>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-fg">{t("Note types")}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {typeList.map((type) => (
              <FilterChip
                key={type}
                selected={types.includes(type)}
                onToggle={() => setTypes((current) => toggle(current, type))}
                onOnly={() => setTypes([type])}
              >
                {typeLabel(type)}
              </FilterChip>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-fg">{taskMode ? t("Task tags") : t("Available tags")}</h3>
        <div className="mt-2 min-h-16 rounded-xl border border-border p-2">
          {available.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">
              {taskMode ? t("No tags on tasks yet.") : t("No tags found. Add tags to your notes to filter by them.")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((tag) => (
                <FilterChip
                  key={tag}
                  selected={tags.includes(tag)}
                  onToggle={() => setTags((current) => toggle(current, tag))}
                  onOnly={() => setTags([tag])}
                >
                  {tag}
                </FilterChip>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            if (taskMode) {
              setTags([]);
              setDone(false);
              setSort("order");
              return;
            }
            setTypes([...typeList]);
            setTags([]);
          }}
        >
          {t("Clear all")}
        </button>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              if (taskMode) onApplyTasks?.({ tags, showDone: done, sort });
              else onApply({ ...filters, types, tags });
            }}
          >
            {t("Apply")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function JumpDialog({
  open,
  place,
  index,
  onClose,
  onJump,
}: {
  open: boolean;
  place: string;
  index: { year: number; months: string[] }[];
  onClose: () => void;
  onJump: (year: string, month: string | null) => void;
}) {
  const [yearPart, monthPart] = place.split(" ");
  const years = index.map((item) => String(item.year));
  const [year, setYear] = useState(years.includes(yearPart) ? yearPart : (years[0] ?? ""));
  const monthsForYear = index.find((item) => String(item.year) === year)?.months ?? [];
  const monthItems = ["Whole year", ...monthsForYear];
  const [month, setMonth] = useState(monthsForYear.includes(monthPart) ? monthPart : "Whole year");

  useEffect(() => {
    if (!open) return;
    const nextYear = years.includes(yearPart) ? yearPart : (years[0] ?? "");
    setYear(nextYear);
    const months = index.find((item) => String(item.year) === nextYear)?.months ?? [];
    setMonth(months.includes(monthPart) ? monthPart : "Whole year");
  }, [open, place, index]);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("Jump")}
      description={t("A year, and a month if you want one.")}
    >
      {years.length === 0 ? (
        <p className="text-sm text-muted">{t("Nothing on the timeline to jump to yet.")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Wheel label={t("Year")} items={years} value={year} onChange={(next) => { setYear(next); setMonth("Whole year"); }} />
            <Wheel
              key={year}
              label={t("Month")}
              items={monthItems}
              value={monthItems.includes(month) ? month : "Whole year"}
              onChange={setMonth}
            />
          </div>
          <button
            type="button"
            className={`${btnPrimary} w-full`}
            onClick={() => onJump(year, month === "Whole year" ? null : month)}
          >
            {t("Go")}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Wheel({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = ref.current?.querySelector<HTMLElement>(`[data-wheel="${CSS.escape(value)}"]`);
    selected?.scrollIntoView({ block: "center" });
  }, [items.join("|")]);

  return (
    <div className="relative min-w-0 flex-1">
      <p className="mb-1 text-center text-xs font-semibold tracking-widest text-muted uppercase">{label}</p>
      <div className="relative h-44">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-lg bg-bg" />
        <div
          ref={ref}
          className="relative z-1 h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none]"
          onScroll={(event) => {
            const root = event.currentTarget;
            const mid = root.scrollTop + root.clientHeight / 2;
            let best = value;
            let distance = Number.POSITIVE_INFINITY;
            for (const item of root.querySelectorAll<HTMLElement>("[data-wheel]")) {
              const center = item.offsetTop + item.offsetHeight / 2;
              const next = Math.abs(center - mid);
              if (next < distance) {
                distance = next;
                best = item.dataset.wheel ?? best;
              }
            }
            if (best !== value) onChange(best);
          }}
        >
          <div className="h-16" />
          {items.map((item) => (
            <button
              key={item}
              type="button"
              data-wheel={item}
              className={cn(
                "flex h-11 w-full snap-center items-center justify-center font-display text-2xl",
                item === value ? "text-fg" : "text-muted",
              )}
              onClick={(event) => {
              onChange(item);
              event.currentTarget.scrollIntoView({ block: "center" });
            }}
            >
              {item === "Whole year" ? t("Whole year") : item}
            </button>
          ))}
          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}

export function HazardNotice({ open, lost, onAck }: { open: boolean; lost: boolean; onAck: () => void }) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-fg/55" />
        <Dialog.Content
          className="hazard-panel fixed inset-x-3 top-16 z-[80] mx-auto flex max-w-lg flex-col overflow-hidden focus:outline-none"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="hazard-tape" aria-hidden />
          <div className="px-5 py-5">
            <Dialog.Title className="font-display text-3xl leading-none">
              {lost ? t("The journal did not open") : t("Notes can disappear")}
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-base text-pretty leading-relaxed">
              {lost
                ? t(
                    "The notes on this device did not open. They may still be stored. Restore a backup before adding anything. A new note will not replace what is stored. This loss is not fixed yet.",
                  )
                : t(
                    "On this device, the journal can come back empty after it is opened again or refreshed. Export a backup before you add notes. A save will not replace notes that are still stored. This loss is not fixed yet.",
                  )}
            </Dialog.Description>
            <button type="button" className="hazard-ack mt-6" onClick={onAck}>
              {t("I understand")}
            </button>
          </div>
          <div className="hazard-tape" aria-hidden />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  state,
  onCancel,
}: {
  state: { title: string; message: string; confirmLabel: string; onConfirm: () => void } | null;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={state != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={t(state?.title ?? "Confirm")}
    >
      <p className="text-pretty text-muted">{state?.message ? t(state.message) : ""}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button type="button" className={btnInk} onClick={() => state?.onConfirm()}>
          {t(state?.confirmLabel ?? "Confirm")}
        </button>
      </div>
    </Modal>
  );
}
