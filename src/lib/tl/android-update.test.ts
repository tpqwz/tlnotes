import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { androidBuildIsNewer } from "./android-update.ts";

describe("android page package", () => {
  it("treats a later stamp as newer and ignores a blank one", () => {
    const older = Date.now().toString(36);
    const newer = (Date.now() + 60_000).toString(36);
    assert.equal(androidBuildIsNewer(older, newer), true);
    assert.equal(androidBuildIsNewer(newer, older), false);
    assert.equal(androidBuildIsNewer("0", newer), true);
    assert.equal(androidBuildIsNewer(older, ""), false);
  });
});
