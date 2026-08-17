// The sidebar, built by walking PARAM_SPEC.
//
// Same arrangement as the Shiny app it replaces: a preset selector, then one
// collapsible section per group of parameters, then the editable text. Adding
// a parameter still means adding one row to PARAM_SPEC and nothing here.

import { STRATA_PALETTES } from "../cover/palette";
import {
  PARAM_SECTIONS,
  PARAM_SPEC,
  PRESET_LABELS,
  TITLE_LINES,
  type CoverParams,
  type ParamSpec,
} from "../cover/params";
import { applyPreset, params, preset, update } from "./state";

function labelFor(spec: ParamSpec): string {
  return spec.unit ? `${spec.label} (${spec.unit})` : spec.label;
}

/** Show a slider's value the way its step implies, not in full precision. */
function formatValue(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(Number.isFinite(decimals) ? Math.min(decimals, 3) : 0);
}

function Control({ spec }: { spec: ParamSpec }) {
  const current = params.value;
  const id = `control-${spec.name}`;

  // A control moving means the cover is no longer the preset it started from.
  const change = (patch: Partial<CoverParams>) => {
    preset.value = "";
    update(patch);
  };

  if (spec.editor === "boolean") {
    return (
      <div class="field field-check">
        <input
          id={id}
          type="checkbox"
          checked={current[spec.name] as boolean}
          onInput={(e) => change({ [spec.name]: e.currentTarget.checked } as Partial<CoverParams>)}
        />
        <label for={id}>{labelFor(spec)}</label>
      </div>
    );
  }

  if (spec.editor === "enum") {
    return (
      <div class="field">
        <label for={id}>{labelFor(spec)}</label>
        <select
          id={id}
          value={current[spec.name] as string}
          onInput={(e) => change({ [spec.name]: e.currentTarget.value } as Partial<CoverParams>)}
        >
          {STRATA_PALETTES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const value = current[spec.name] as number;
  return (
    <div class="field">
      <label for={id}>
        {labelFor(spec)}
        <span class="value">{formatValue(value, spec.step ?? 1)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={spec.lower}
        max={spec.upper}
        step={spec.step}
        value={value}
        onInput={(e) =>
          change({ [spec.name]: Number(e.currentTarget.value) } as Partial<CoverParams>)
        }
      />
    </div>
  );
}

function Section({ name, open }: { name: string; open: boolean }) {
  const specs = PARAM_SPEC.filter((s) => s.section === name && s.editor !== "text");
  if (specs.length === 0) return null;
  return (
    <details open={open}>
      <summary>{name}</summary>
      <div class="section-body">
        {specs.map((spec) => (
          <Control key={spec.name} spec={spec} />
        ))}
      </div>
    </details>
  );
}

function TextSection() {
  const current = params.value;
  const setLine = (index: number, text: string) => {
    const lines = Array.from({ length: TITLE_LINES }, (_, i) => current.title[i] ?? "");
    lines[index] = text;
    const kept = lines.filter((line) => line.length > 0);
    preset.value = "";
    // The cover needs at least one line; an empty last field is normal while
    // typing, so the previous title stands until something is entered.
    if (kept.length > 0) update({ title: kept });
  };

  return (
    <details>
      <summary>Text</summary>
      <div class="section-body">
        <label for="title-0">Title lines</label>
        {Array.from({ length: TITLE_LINES }, (_, i) => (
          <input
            key={i}
            id={`title-${i}`}
            type="text"
            class="text-input"
            value={current.title[i] ?? ""}
            onInput={(e) => setLine(i, e.currentTarget.value)}
          />
        ))}
        <label for="author">Author</label>
        <input
          id="author"
          type="text"
          class="text-input"
          value={current.name}
          onInput={(e) => {
            preset.value = "";
            update({ name: e.currentTarget.value || " " });
          }}
        />
      </div>
    </details>
  );
}

export function Controls() {
  return (
    <aside class="sidebar">
      <div class="field">
        <label for="preset">Preset</label>
        <select
          id="preset"
          value={preset.value}
          onInput={(e) => applyPreset(e.currentTarget.value)}
        >
          {preset.value === "" && (
            <option value="" disabled>
              Custom
            </option>
          )}
          {Object.entries(PRESET_LABELS).map(([name, label]) => (
            <option key={name} value={name}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {PARAM_SECTIONS.map((section) => (
        <Section key={section} name={section} open={section === "Line art"} />
      ))}
      <TextSection />
    </aside>
  );
}
