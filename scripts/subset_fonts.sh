#!/usr/bin/env bash
# Cut the vendored Inter faces down to what the cover can actually set.
#
#   scripts/subset_fonts.sh
#
# app/www/fonts/ holds the full faces, which the R pipeline registers and which
# are the licensed originals. The browser build does not need all 2,500 glyphs:
# a first visit should not spend 830 kB on type it will never draw. Subsetting
# to Latin and the punctuation the cover uses takes each face from ~410 kB to
# ~45 kB as woff2.
#
# Two flavours come out of this, from one glyph set so the page and the PDF
# can never disagree about which characters exist:
#
#   *.subset.woff2 - loaded on every visit, for the interface, the canvas
#                    previews and the rasterised PNG.
#   *.subset.ttf   - fetched only when someone asks for a PDF, because
#                    pdf-lib embeds TrueType and cannot read woff2.
#
# Inter is under the SIL Open Font License 1.1, which permits subsetting; the
# licence is copied alongside the output. Do not install these into a system
# font library — see the Gotchas section of AGENTS.md for why that breaks the
# R side.

set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE_DIR="app/www/fonts"
DEST_DIR="web/src/fonts"

# Latin, Latin Extended-A and -B, spacing modifiers, general punctuation,
# currency, and the arrows and maths signs the guide labels use. The author
# name needs U+00DF and the guide legend needs U+00D7 and U+00B7, so anything
# narrower than Latin-1 is too narrow.
UNICODES='U+0020-007E,U+00A0-00FF,U+0100-017F,U+0180-024F,U+02B0-02FF'
UNICODES="$UNICODES,U+2000-206F,U+20A0-20BF,U+2122,U+2190-2193,U+2212,U+2260,U+2264,U+2265"

# Keep kerning and the contextual features Inter relies on, or the type sets
# measurably wider than title_overflow() predicts.
FEATURES='kern,liga,clig,calt,ccmp,locl,mark,mkmk,rlig,rclt'

mkdir -p "$DEST_DIR"

for face in Regular Medium; do
  for flavor in woff2 ttf; do
    # pyftsubset writes TrueType when no flavour is named, woff2 when one is.
    if [ "$flavor" = "woff2" ]; then
      flavour_flag="--flavor=woff2"
    else
      flavour_flag=""
    fi
    uvx --quiet --from 'fonttools[woff]' pyftsubset \
      "$SOURCE_DIR/Inter-$face.ttf" \
      --unicodes="$UNICODES" \
      --layout-features="$FEATURES" \
      ${flavour_flag} \
      --output-file="$DEST_DIR/Inter-$face.subset.$flavor"
  done
done

# Vite hashes and rewrites anything under src/, which is what keeps the font
# URLs correct under the /thesis-cover/ base on GitHub Pages. The licence is
# served as a plain file instead, so the faces the site distributes carry it.
cp "$SOURCE_DIR/Inter-LICENSE.txt" "web/public/Inter-LICENSE.txt"

echo "wrote $DEST_DIR:"
ls -lh "$DEST_DIR" | tail -n +2
