// The one piece of application state, and everything derived from it.
//
// Preact signals rather than component state: the parameters are read by the
// sidebar, both previews, the download panel and the address bar, and a signal
// lets each of those recompute on its own instead of re-rendering the tree.
// The previews are the expensive part, and they are not components at all —
// they paint to a canvas from an effect.

import { computed, signal } from "@preact/signals";

import { coverGeometry } from "../cover/geometry";
import { coverParams, type CoverParams } from "../cover/params";
import { coverParamsFromQuery, coverQuery } from "../cover/url-state";
import { buildScene } from "../cover/scene";
import {
  createSavedPreset,
  loadSavedPresets,
  storeSavedPresets,
  type SavedPreset,
} from "./saved-presets";

export const BUILTIN_PRESET_PREFIX = "builtin:";
export const SAVED_PRESET_PREFIX = "saved:";

/** The current cover, restored from the link the visitor arrived on. */
export const params = signal<CoverParams>(coverParamsFromQuery(window.location.search));

/** Which preset the sidebar is showing; cleared as soon as a control moves. */
export const preset = signal<string>(
  window.location.search.length > 1 ? "" : `${BUILTIN_PRESET_PREFIX}default`,
);

/** Named presets stored only in this browser. */
export const savedPresets = signal<SavedPreset[]>(readBrowserPresets());

/** Set once both Inter faces have loaded, so text measures correctly. */
export const fontsLoaded = signal(false);

export const geometry = computed(() => coverGeometry(params.value));
export const wrapScene = computed(() => buildScene(geometry.value, "wrap"));
export const frontScene = computed(() => buildScene(geometry.value, "front"));

/** Apply a change, leaving everything else alone. */
export function update(patch: Partial<CoverParams>): void {
  try {
    params.value = coverParams({ ...params.value, ...patch });
  } catch {
    // A control cannot produce an invalid value on its own, but a half-typed
    // number can; keep the last good cover rather than blanking the preview.
  }
}

/** Load a built-in or browser-local preset. */
export function applyPreset(selection: string): void {
  if (selection.startsWith(BUILTIN_PRESET_PREFIX)) {
    const name = selection.slice(BUILTIN_PRESET_PREFIX.length);
    params.value = coverParams({ title: params.value.title, name: params.value.name }, name);
    preset.value = selection;
    return;
  }

  if (selection.startsWith(SAVED_PRESET_PREFIX)) {
    const id = selection.slice(SAVED_PRESET_PREFIX.length);
    const saved = savedPresets.value.find((candidate) => candidate.id === id);
    if (saved) {
      params.value = coverParams({ ...saved.params, title: [...saved.params.title] });
      preset.value = selection;
    }
  }
}

/** Snapshot all current parameters under a new browser-local preset. */
export function saveCurrentPreset(name: string): SavedPreset {
  const saved = createSavedPreset(name, params.value, savedPresets.value);
  const next = [...savedPresets.value, saved];
  try {
    storeSavedPresets(window.localStorage, next);
  } catch {
    throw new Error("This browser could not save the preset. Check whether local storage is enabled.");
  }
  savedPresets.value = next;
  preset.value = `${SAVED_PRESET_PREFIX}${saved.id}`;
  return saved;
}

/**
 * Keep the address bar in step, so the current cover is just a link.
 *
 * replaceState rather than pushState: dragging a slider should not fill the
 * back button with fifty intermediate covers.
 */
export function syncUrl(): void {
  const query = coverQuery(params.value);
  window.history.replaceState(null, "", query === "?" ? window.location.pathname : query);
}

function readBrowserPresets(): SavedPreset[] {
  try {
    return loadSavedPresets(window.localStorage);
  } catch {
    return [];
  }
}
