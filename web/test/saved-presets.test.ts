import { describe, expect, it } from "vitest";

import { coverParams } from "../src/cover/params";
import {
  SAVED_PRESETS_KEY,
  createSavedPreset,
  loadSavedPresets,
  storeSavedPresets,
} from "../src/ui/saved-presets";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("saved presets", () => {
  it("trims the name and snapshots every current setting", () => {
    const current = coverParams({ seed: 7, title: ["A new title"], name: "A. Researcher" });
    const saved = createSavedPreset("  Print candidate  ", current, [], () => "preset-1");

    expect(saved.id).toBe("preset-1");
    expect(saved.name).toBe("Print candidate");
    expect(saved.params).toEqual(current);
    expect(saved.params.title).not.toBe(current.title);
  });

  it("refuses blank, duplicate, and built-in names", () => {
    const params = coverParams();
    const existing = [createSavedPreset("Final", params, [], () => "preset-1")];

    expect(() => createSavedPreset("  ", params, existing)).toThrow("Enter a name");
    expect(() => createSavedPreset("final", params, existing)).toThrow("already exists");
    expect(() => createSavedPreset("Sparse", params, existing)).toThrow("already exists");
  });

  it("round-trips through local storage", () => {
    const storage = new MemoryStorage();
    const saved = createSavedPreset("Contour", coverParams({ seed: 9 }), [], () => "preset-1");

    storeSavedPresets(storage, [saved]);
    expect(loadSavedPresets(storage)).toEqual([saved]);
  });

  it("keeps valid entries when storage also contains malformed data", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SAVED_PRESETS_KEY,
      JSON.stringify([
        { id: "good", name: "Good", params: coverParams({ seed: 8 }) },
        { id: "bad", name: "Bad", params: { seed: "banana" } },
        { id: "missing-params", name: "Missing" },
      ]),
    );

    expect(loadSavedPresets(storage).map((preset) => preset.name)).toEqual(["Good"]);
  });

  it("treats unreadable storage as an empty list", () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVED_PRESETS_KEY, "not json");
    expect(loadSavedPresets(storage)).toEqual([]);
  });
});
