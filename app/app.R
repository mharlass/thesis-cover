# Interactive cover generator.
#
# Everything the app draws comes from R/, which the command-line renderer in
# scripts/generate_cover.R also uses; Shiny sources that directory
# automatically. Deployed to GitHub Pages as WebAssembly by
# scripts/build_site.R, so it must stay free of anything webR cannot do.

library(shiny)
library(bslib)

register_cover_fonts()

# --- user interface ---------------------------------------------------------

#' One control, laid out from its row of PARAM_SPEC.
#'
#' Sliders are drawn without their tick grid: several of them step in twos
#' across a range of hundreds, and the resulting row of numbers collides with
#' itself at any sidebar width that leaves room for the previews.
param_input <- function(name, label, editor, lower, upper, step, unit, default, ...) {
  label <- if (is.na(unit)) label else glue("{label} ({unit})")
  switch(editor,
    range = sliderInput(name, label,
      min = lower, max = upper, value = default, step = step, ticks = FALSE
    ),
    int = numericInput(name, label, value = default, min = lower, max = upper, step = step),
    boolean = checkboxInput(name, label, value = default),
    enum = selectInput(name, label, choices = STRATA_PALETTES, selected = default)
  )
}

#' The sidebar sections, in the order PARAM_SECTIONS gives them.
control_panels <- function() {
  defaults <- cover_params()
  sections <- PARAM_SECTIONS %>%
    map(\(section) {
      accordion_panel(
        section,
        PARAM_SPEC %>%
          filter(section == .env$section, editor != "text") %>%
          pmap(param_input)
      )
    })
  text_section <- accordion_panel(
    "Text",
    tags$label("Title lines", class = "form-label"),
    map(seq_len(TITLE_LINES), \(i) {
      textInput(paste0("title", i), NULL, defaults$title[i] %||% "", width = "100%")
    }),
    textInput("name", "Author", defaults$name, width = "100%")
  )
  append(sections, list(text_section))
}

# The interface is set in the same Inter the cover is, served from the copy
# already vendored under www/fonts/ rather than fetched from Google: the faces
# ride along in the app bundle either way, and the page then makes no
# third-party request on load.
INTER_UI <- font_collection(
  bslib::font_face(
    family = "Inter", weight = 400,
    src = "url('fonts/Inter-Regular.ttf') format('truetype')"
  ),
  bslib::font_face(
    family = "Inter", weight = 500,
    src = "url('fonts/Inter-Medium.ttf') format('truetype')"
  ),
  "system-ui", "sans-serif"
)

# Spacing and surface colours. bslib's defaults sit the cards flush against
# the page background and pack the controls tightly enough that slider labels
# touch, so the design system's own surface, divider and radius tokens are
# applied on top.
cover_css <- HTML(glue("
  :root {{
    --cover-surface: {NOCTURNE[['surface']]};
    --cover-divider: {NOCTURNE[['n800']]};
    --cover-muted: {NOCTURNE[['n500']]};
    --bslib-spacer: 1.25rem;
  }}
  .bslib-page-sidebar > .bslib-sidebar-layout {{ border: none; }}
  .bslib-sidebar-layout > .sidebar > .sidebar-content {{
    padding: 1.25rem 1.15rem; gap: 1rem;
  }}
  .bslib-sidebar-layout > .main {{ padding: 1.25rem 1.5rem 2rem; }}
  .card {{
    background-color: var(--cover-surface);
    border: 1px solid var(--cover-divider);
    border-radius: 14px;
  }}
  .card-header {{
    background-color: transparent;
    border-bottom: 1px solid var(--cover-divider);
    font-weight: 500; padding: 0.7rem 1rem;
  }}
  .card-body {{ padding: 1rem; }}
  .accordion-button {{ font-weight: 500; }}
  .accordion-body {{ padding-bottom: 0.35rem; }}
  .shiny-input-container {{ margin-bottom: 1.35rem; }}
  .shiny-input-container:last-child {{ margin-bottom: 0.5rem; }}
  .control-label, .form-label {{ font-weight: 500; margin-bottom: 0.5rem; }}
  .irs {{ margin-bottom: 0; }}
  .irs-min, .irs-max {{ background: transparent; color: var(--cover-muted); }}
  /* The previews are sized by aspect ratio from the server, so the output
     must take its height from the image instead of plotOutput's 400px. */
  .shiny-plot-output {{ height: auto !important; }}
  .shiny-plot-output img {{
    display: block; width: 100%; height: auto; border-radius: 6px;
  }}
  /* bslib maps $light onto a dark shade under a dark theme, which leaves
     btn-outline-light unreadable, so the secondary buttons are drawn here. */
  .btn-cover {{
    color: {NOCTURNE[['n300']]};
    border: 1px solid {NOCTURNE[['n700']]};
    background-color: transparent;
  }}
  .btn-cover:hover, .btn-cover:focus {{
    color: {NOCTURNE[['text']]};
    border-color: {NOCTURNE[['accent']]};
    background-color: {NOCTURNE[['a900']]};
  }}
  /* layout_columns wraps each card in a stretched grid item, so the card has
     to opt out of growing inside it rather than out of the grid. */
  .cover-panel {{ flex: 0 0 auto; }}
  .spec {{ border-top: 1px solid var(--cover-divider); margin-top: 1rem; }}
  .spec div {{
    display: flex; justify-content: space-between; gap: 1rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--cover-divider);
    font-size: 0.85rem;
  }}
  .spec dt {{ color: var(--cover-muted); font-weight: 400; margin: 0; }}
  .spec dd {{ margin: 0; font-variant-numeric: tabular-nums; }}
"))

ui <- page_sidebar(
  title = "Thesis cover",
  window_title = "Thesis cover",
  # The previews are tall and there are two of them, so the main column
  # scrolls at its natural height instead of being squeezed into the viewport.
  fillable = FALSE,
  theme = bs_theme(
    version = 5,
    bg = NOCTURNE[["bg"]], fg = NOCTURNE[["text"]],
    primary = NOCTURNE[["accent"]], base_font = INTER_UI
  ),
  tags$head(tags$style(cover_css)),
  sidebar = sidebar(
    width = 340,
    selectInput("preset", "Preset", choices = set_names(names(PRESET_LABELS), PRESET_LABELS)),
    do.call(accordion, c(control_panels(), list(open = "Line art", multiple = FALSE)))
  ),
  card(
    card_header("Full wrap — back · spine · front"),
    card_body(plotOutput("wrap", height = "auto"), padding = "0.75rem")
  ),
  layout_columns(
    col_widths = c(5, 7),
    card(
      card_header("Front — trimmed 170 × 240 mm"),
      card_body(plotOutput("front", height = "auto"), padding = "0.75rem")
    ),
    # The download panel is much shorter than the front preview beside it, so
    # it keeps its own height rather than stretching to match the row.
    card(
      class = "cover-panel",
      card_header("Download"),
      card_body(
        gap = "0.6rem",
        uiOutput("fit"),
        downloadButton("svg", "SVG (vector, for the printer)", class = "btn-primary"),
        downloadButton("pdf", "PDF", class = "btn-cover"),
        downloadButton("png", "PNG (300 dpi)", class = "btn-cover"),
        uiOutput("meta")
      )
    )
  )
)

# --- server -----------------------------------------------------------------

#' Push a whole parameter set back into the controls.
apply_params <- function(session, params) {
  PARAM_SPEC %>%
    filter(editor != "text") %>%
    pwalk(\(name, editor, ...) {
      switch(editor,
        boolean = updateCheckboxInput(session, name, value = params[[name]]),
        enum = updateSelectInput(session, name, selected = params[[name]]),
        int = updateNumericInput(session, name, value = params[[name]]),
        updateSliderInput(session, name, value = params[[name]])
      )
    })
  walk(seq_len(TITLE_LINES), \(i) {
    updateTextInput(session, paste0("title", i), value = params$title[i] %||% "")
  })
  updateTextInput(session, "name", value = params$name)
}

server <- function(input, output, session) {
  # A shared link wins over the defaults, so restore before anything is drawn.
  observeEvent(session$clientData$url_search,
    once = TRUE,
    apply_params(session, cover_params_from_query(session$clientData$url_search))
  )

  observeEvent(input$preset,
    ignoreInit = TRUE,
    apply_params(session, cover_params(preset = input$preset))
  )

  params <- reactive({
    controls <- PARAM_SPEC %>%
      filter(editor != "text") %>%
      pull(name) %>%
      set_names() %>%
      map(\(name) input[[name]])
    title <- map_chr(seq_len(TITLE_LINES), \(i) input[[paste0("title", i)]] %||% "")
    req(!any(map_lgl(controls, is.null)), is.finite(controls$seed), any(nzchar(title)))

    do.call(cover_params, c(
      controls,
      list(title = keep(title, nzchar), name = input$name %||% " ")
    ))
  }) %>%
    debounce(400)

  geometry <- reactive(cover_geometry(params()))

  # Keep the address bar in step so the current cover can simply be linked to.
  observe(updateQueryString(cover_query(params()), mode = "replace"))

  # Hold the drawn aspect ratio, whatever width the browser gives the card.
  plot_height <- function(id, ratio) {
    function() {
      width <- session$clientData[[paste0("output_", id, "_width")]]
      if (is.null(width)) 400 else width * ratio
    }
  }

  output$wrap <- renderPlot(
    cover_ggplot(geometry(), "wrap"),
    height = plot_height("wrap", 246 / 358),
    bg = NOCTURNE[["bg"]]
  )
  output$front <- renderPlot(
    cover_ggplot(geometry(), "front"),
    height = plot_height("front", 240 / 170),
    bg = NOCTURNE[["bg"]]
  )

  output$fit <- renderUI({
    overflow <- title_overflow(params())
    if (overflow <= 0) {
      return(NULL)
    }
    div(
      class = "alert alert-warning py-2",
      glue(
        "The title runs {round(overflow, 1)} mm past the front panel's safe ",
        "area. Reduce the title scale or shorten the longest line."
      )
    )
  })

  output$meta <- renderUI({
    dims <- geometry()$dims
    rows <- c(
      Trim = glue("{dims$trim_width} × {dims$trim_height} mm"),
      Bleed = glue("{dims$bleed} mm"),
      Spine = glue("{dims$spine} mm"),
      Wrap = glue("{dims$width} × {dims$height} mm"),
      Seed = params()$seed
    )
    tags$dl(
      class = "spec",
      imap(rows, \(value, label) div(tags$dt(label), tags$dd(as.character(value))))
    )
  })

  download <- function(format, dpi = 300) {
    downloadHandler(
      filename = \() paste0("thesis-cover.", format),
      content = \(file) cover_save(params(), file, dpi = dpi, format = format)
    )
  }
  output$svg <- download("svg")
  output$pdf <- download("pdf")
  output$png <- download("png")
}

shinyApp(ui, server)
