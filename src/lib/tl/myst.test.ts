import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mystHtml } from "./myst.ts";
import { UPDATE_NOTES } from "./updates.ts";

describe("update card", () => {
  it("reads the newest card as MyST, and escapes the rest", () => {
    const card = UPDATE_NOTES.find((note) => note.id === "update-2026-11-07");
    assert.ok(card);
    const html = mystHtml(card.content);
    assert.match(html, /<h3>What changed since<\/h3>/);
    assert.match(html, /<h4>Calendar<\/h4>/);
    assert.match(html, /<blockquote><p>An old note/);
    assert.match(html, /<strong>later<\/strong>/);
    assert.match(html, /<strong>TLNotes<\/strong>/);
    assert.equal(mystHtml("<script>alert(1)</script>").includes("<script>"), false);
  });
});
