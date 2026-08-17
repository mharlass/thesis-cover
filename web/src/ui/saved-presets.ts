// Browser-local named presets.
//
// Built-in presets live in cover/params.ts and are part of the artwork. These
// are deliberately separate: they belong to one browser, may carry edited
// title text, and must never change what a shared URL means.

import { PRESET_LABELS, coverParams, type CoverParams } from "../cover/params";

export const SAVED_PRESETS_KEY = "thesis-cover:saved-presets:v1";

export interface SavedPreset {
  id: string;
  name: string;
  params: CoverParams;
}

interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read valid presets and quietly leave malformed browser data alone. */
export function loadSavedPresets(storage: PresetStorage): SavedPreset[] {
  try {
    const raw = storage.getItem(SAVED_PRESETS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const presets: SavedPreset[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const candidate of parsed) {
      if (!isRecord(candidate) || !isRecord(candidate.params)) continue;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const foldedName = name.toLocaleLowerCase();
      if (!id || !name || name.length > 60 || ids.has(id) || names.has(foldedName)) continue;

      try {
        presets.push({
          id,
          name,
          // coverParams also supplies parameters introduced after this preset
          // was saved, which gives the storage format a simple migration path.
          params: coverParams(candidate.params as Partial<CoverParams>),
        });
        ids.add(id);
        names.add(foldedName);
      } catch {
        // One broken entry should not hide the visitor's other saved presets.
      }
    }
    return presets;
  } catch {
    return [];
  }
}

/** Persist the complete list as one small, versioned localStorage value. */
export function storeSavedPresets(storage: PresetStorage, presets: SavedPreset[]): void {
  storage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
}

/** Validate and snapshot the current settings under a new local name. */
export function createSavedPreset(
  rawName: string,
  params: CoverParams,
  existing: SavedPreset[],
  makeId: () => string = presetId,
): SavedPreset {
  const name = rawName.trim();
  if (!name) throw new Error("Enter a name for this preset.");
  if (name.length > 60) throw new Error("Preset names can be at most 60 characters.");

  const foldedName = name.toLocaleLowerCase();
  const reserved = Object.values(PRESET_LABELS).some(
    (label) => label.toLocaleLowerCase() === foldedName,
  );
  if (reserved || existing.some((preset) => preset.name.toLocaleLowerCase() === foldedName)) {
    throw new Error(`A preset named “${name}” already exists.`);
  }

  return {
    id: makeId(),
    name,
    params: coverParams({ ...params, title: [...params.title] }),
  };
}

function presetId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
