import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { citedQuotation, quotationFaces, type Note } from "./model.ts";
import { applyLanguage, languageChoices, languageCode, languageMatches, languageName } from "./language.ts";
import { passages } from "./wiki.ts";
import { smallImage } from "./small-image.ts";

function quote(partial: Partial<Note> & Pick<Note, "content">): Note {
  return {
    id: partial.id ?? "q",
    type: "quotation",
    tags: [],
    created: 1,
    edited: 1,
    date: null,
    ...partial,
  };
}

describe("language", () => {
  it("knows Latin and English by their several names", () => {
    assert.equal(languageCode("Lingua Latina"), "la");
    assert.equal(languageCode("en-US"), "en");
    assert.equal(languageMatches("English", "en"), true);
    assert.equal(languageName("la"), "Lingua Latina");
  });

  it("always offers the device, English, and Latin", () => {
    const choices = languageChoices([{ originalLanguage: "Greek", languages: [{ language: "French" }] }]);
    assert.deepEqual(
      choices.map((choice) => choice.id),
      ["system", "en", "la", "grc", "fr"],
    );
  });
});

describe("quotation lead", () => {
  const note = quote({
    content: "carpe diem",
    originalLanguage: "Latin",
    languages: [
      { id: "en", language: "English", text: "Pluck the day", translator: "John Dryden" },
      { id: "it", language: "Italian", text: "Cogli il giorno" },
    ],
    sources: [{ id: "s", author: "Horace", work: "Odes", container: "", edition: "", locator: "1.11", published: "23 BCE", url: "" }],
  });

  it("leads in Latin when that is the app language", () => {
    applyLanguage("la");
    const faces = quotationFaces(note);
    assert.equal(faces.primary, "carpe diem");
    assert.equal(faces.showOriginal, false);
    assert.equal(faces.translator, "");
    applyLanguage("system");
  });

  it("leads in English when that wording exists", () => {
    applyLanguage("en");
    const faces = quotationFaces(note);
    assert.equal(faces.primary, "Pluck the day");
    assert.equal(faces.showOriginal, true);
    assert.equal(faces.translator, "John Dryden");
    assert.match(citedQuotation(note), /^“Pluck the day”/);
    assert.match(citedQuotation(note), /Translated by John Dryden/);
    assert.match(citedQuotation(note), /“carpe diem”/);
    assert.match(citedQuotation(note), /— Horace, Odes, 23 BCE, 1\.11/);
  });

  it("keeps the original when the app language has no wording", () => {
    applyLanguage("fr");
    assert.equal(quotationFaces(note).primary, "carpe diem");
    assert.equal(quotationFaces(note).showOriginal, false);
    applyLanguage("system");
  });
});

describe("passages", () => {
  it("gathers a quotation whose source names the book", () => {
    const book: Note = {
      id: "book",
      type: "book",
      content: "A speech.",
      tags: [],
      created: 1,
      edited: 1,
      date: null,
      labels: [{ text: "Apology", language: "en" }],
    };
    const line = quote({
      id: "line",
      content: "ὁ δὲ ἀνεξέταστος βίος",
      sources: [{ id: "s", author: "Socrates", work: "Plato, Apology", container: "", edition: "", locator: "38a", published: "", url: "" }],
    });
    const other = quote({ id: "other", content: "elsewhere", sources: [{ id: "s2", author: "Horace", work: "Odes", container: "", edition: "", locator: "", published: "", url: "" }] });
    const found = passages(book, [book, line, other]);
    assert.deepEqual(found.map((item) => item.id), ["line"]);
  });
});

describe("small pictures", () => {
  it("asks wikimedia for a modest width", () => {
    assert.equal(
      smallImage("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Face.jpg/320px-Face.jpg"),
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Face.jpg/160px-Face.jpg",
    );
    const commons = new URL(smallImage("https://commons.wikimedia.org/wiki/Special:FilePath/Face.jpg"));
    assert.equal(commons.searchParams.get("width"), "160");
  });
});
