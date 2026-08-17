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

/** The current cover, restored from the link the visitor arrived on. */
export const params = signal<CoverParams>(coverParamsFromQuery(window.location.search));

/** Which preset the sidebar is showing; cleared as soon as a control moves. */
export const preset = signal<string>("default");

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

/** Load a named preset, replacing every parameter it names. */
export function applyPreset(name: string): void {
  preset.value = name;
  params.value = coverParams({ title: params.value.title, name: params.value.name }, name);
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
