// The cover generator.
//
// Everything it draws comes from src/cover/, which is a port of the R pipeline
// in app/R/ and is held to it by web/test/geometry.test.ts. This file is only
// the arrangement on the page.

import { useEffect } from "preact/hooks";

import { fontsReady } from "./cover/measure";
import { Controls } from "./ui/Controls";
import { Downloads } from "./ui/Downloads";
import { Preview } from "./ui/Preview";
import { fontsLoaded, frontScene, params, syncUrl, wrapScene } from "./ui/state";

export function App() {
  // Both previews set type on canvas, which silently falls back to the
  // platform sans until the face has loaded. Repaint once it has.
  useEffect(() => {
    fontsReady().then(() => {
      fontsLoaded.value = true;
    });
  }, []);

  useEffect(() => syncUrl(), [params.value]);

  return (
    <>
      <header>
        <h1>Thesis cover</h1>
        <p class="subtitle">Back · spine · front, in one sheet</p>
      </header>

      <div class="layout">
        <Controls />

        <main>
          <section class="panel">
            <h2>Full wrap — back · spine · front</h2>
            <Preview scene={wrapScene.value} ready={fontsLoaded.value} label="Full cover wrap" />
          </section>

          <div class="row">
            <section class="panel">
              <h2>Front — trimmed 170 × 240 mm</h2>
              <Preview
                scene={frontScene.value}
                ready={fontsLoaded.value}
                label="Front panel"
              />
            </section>
            <Downloads />
          </div>
        </main>
      </div>
    </>
  );
}
