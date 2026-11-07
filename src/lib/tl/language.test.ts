import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { citedQuotation, quotationFaces, type Note } from "./model.ts";
import { applyLanguage, formatUiDate, languageChoices, languageCode, languageMatches, languageName, parseRoman, romanNumeral, speaksLanguage, SPOKEN } from "./language.ts";
import { t } from "./i18n.ts";
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
    assert.equal(languageName("la"), "Lingua Latīna");
  });

  it("always offers the languages the app can speak", () => {
    const base = ["system", "en", "la", ...SPOKEN.map((item) => item.id)];
    const choices = languageChoices([{ originalLanguage: "Greek", languages: [{ language: "French" }, { language: "xh" }] }]);
    assert.deepEqual(
      choices.map((choice) => choice.id),
      [...base, "xh"],
    );
    assert.equal(choices.find((choice) => choice.id === "fr")?.label, "Français");
    assert.equal(choices.find((choice) => choice.id === "arc")?.label, "Ārāmāʾīṯ");
    assert.equal(choices.find((choice) => choice.id === "grc")?.label, "Ἀρχαία Ἑλληνική");
    assert.equal(choices.find((choice) => choice.id === "agl")?.label, "Anglish");
    assert.equal(choices.find((choice) => choice.id === "wyc")?.label, "English - Wycliffe");
    assert.equal(choices.find((choice) => choice.id === "kjv")?.label, "English - King James");
    assert.equal(choices.find((choice) => choice.id === "ang")?.label, "Old English - Beowulf");
    assert.equal(choices.find((choice) => choice.id === "ga")?.label, "Gaelic - Irish");
    assert.equal(choices.find((choice) => choice.id === "gd")?.label, "Gaelic - Scottish");
    assert.equal(languageCode("Aramaic"), "arc");
    assert.equal(languageCode("Classical Syriac"), "arc");
    assert.equal(languageCode("Anglish"), "agl");
    assert.equal(languageCode("Wycliffe"), "wyc");
    assert.equal(languageCode("Middle English"), "wyc");
    assert.equal(languageCode("King James"), "kjv");
    assert.equal(languageCode("Old English"), "ang");
    assert.equal(languageCode("Anglo-Saxon"), "ang");
    assert.equal(languageCode("Gaeilge"), "ga");
    assert.equal(languageCode("Irish Gaelic"), "ga");
    assert.equal(languageCode("Gàidhlig"), "gd");
    assert.equal(languageCode("Scottish Gaelic"), "gd");
    assert.notEqual(languageCode("Scots"), "gd");
  });

  it("speaks those languages in the buttons, and keeps a bare menu to them", () => {
    const word: Record<string, string> = {
      la: "Institūta",
      es: "Ajustes",
      grc: "Διατάξεις",
      sa: "व्यवस्था",
      pi: "Ṭhapanā",
      arc: "ṭukkāsē",
      he: "הגדרות",
      fa: "تنظیمات",
      agl: "Setness",
      wyc: "Ordinaunces",
      kjv: "Ordinances",
      ang: "Diht",
      ga: "Socruithe",
      gd: "Roghainnean",
    };
    for (const item of SPOKEN) {
      applyLanguage(item.id);
      assert.equal(speaksLanguage(item.id), true);
      assert.notEqual(t("Settings"), "Settings");
      assert.notEqual(t("Search"), "Search");
    }
    for (const [code, settings] of Object.entries(word)) {
      applyLanguage(code);
      assert.equal(t("Settings"), settings);
    }
    applyLanguage("xh");
    assert.equal(speaksLanguage("xh"), false);
    assert.equal(t("Settings"), "Settings");
    const bare = languageChoices([]);
    assert.deepEqual(
      bare.map((choice) => choice.id),
      ["system", "en", "la", ...SPOKEN.map((item) => item.id)],
    );
    applyLanguage("system");
  });

  it("numbers a Latin date and a Latin count with Roman numerals", () => {
    assert.equal(romanNumeral(0), "nulla");
    assert.equal(romanNumeral(4), "IV");
    assert.equal(romanNumeral(9), "IX");
    assert.equal(romanNumeral(44), "XLIV");
    assert.equal(romanNumeral(2026), "MMXXVI");
    assert.equal(parseRoman("XIV"), 14);
    assert.equal(parseRoman("iiii"), 4);
    assert.equal(parseRoman("nulla"), 0);
    applyLanguage("la");
    const day = new Date(2026, 2, 14);
    assert.equal(formatUiDate(day, { month: "long", day: "numeric", year: "numeric" }), "XIV Mārtius MMXXVI");
    assert.equal(formatUiDate(day, { weekday: "long", month: "long", day: "numeric" }), "diēs Sāturnī, XIV Mārtiī");
    assert.equal(
      formatUiDate(new Date(2026, 2, 14, 15, 5), { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
      "XIV Mār MMXXVI, XV·V",
    );
    assert.equal(formatUiDate(new Date(2026, 2, 14, 9, 0), { hour: "numeric", minute: "2-digit" }), "XIV Mār MMXXVI, IX·nulla");
    assert.equal(t("1 note"), "I nota");
    assert.equal(t("{n} notes", { n: 3 }), "III notae");
    assert.equal(t("Language {n}", { n: 2 }), "Lingua II");
    assert.equal(t("{done} of {total} read.", { done: 4, total: 12 }), "IV ex XII lecta.");
    applyLanguage("en");
    assert.equal(t("{n} notes", { n: 3 }), "3 notes");
    assert.match(formatUiDate(day, { month: "long", day: "numeric", year: "numeric" }), /2026/);
    applyLanguage("system");
  });

  it("writes the historical Englishes and the two Gaelics on their own dates", () => {
    const day = new Date(2026, 2, 14, 15, 5);
    const full = { month: "long" as const, day: "numeric" as const, year: "numeric" as const };
    const week = { weekday: "long" as const, month: "long" as const, day: "numeric" as const };
    const month = { month: "long" as const };
    applyLanguage("agl");
    assert.equal(formatUiDate(day, full), "14 Rethemonth 2026");
    assert.equal(formatUiDate(day, week), "Saterday, 14 Rethemonth");
    assert.equal(formatUiDate(day, month), "Rethemonth");
    applyLanguage("wyc");
    assert.equal(formatUiDate(day, full), "14 March 2026");
    assert.equal(formatUiDate(day, week), "Saterdai, 14 March");
    applyLanguage("kjv");
    assert.equal(formatUiDate(day, full), "the 14th day of March, 2026");
    assert.equal(formatUiDate(day, week), "Saturday, the 14th day of March");
    applyLanguage("ang");
    assert.equal(formatUiDate(day, full), "14 Hrēþmōnaþ 2026");
    assert.equal(formatUiDate(day, week), "Sæternesdæg, 14 Hrēþmōnaþ");
    assert.equal(formatUiDate(day, month), "Hrēþmōnaþ");
    applyLanguage("ga");
    assert.match(formatUiDate(day, month), /Márta/);
    applyLanguage("gd");
    assert.match(formatUiDate(day, month), /Màrt/);
    applyLanguage("system");
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
