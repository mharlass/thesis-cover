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
param_input <- function(name, label, editor, lower, upper, step, unit, default, ...) {
  label <- if (is.na(unit)) label else str_glue("{label} ({unit})")
  switch(editor,
    range = sliderInput(name, label, min = lower, max = upper, value = default, step = step),
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
    map(seq_len(TITLE_LINES), \(i) {
      textInput(str_c("title", i), NULL, defaults$title[i] %||% "", width = "100%")
    }),
    textInput("name", "Author", defaults$name, width = "100%")
  )
  append(sections, list(text_section))
}

ui <- page_sidebar(
  title = "Thesis cover",
  theme = bs_theme(
    version = 5,
    bg = NOCTURNE[["bg"]], fg = NOCTURNE[["text"]],
    # local = FALSE keeps the font a browser request; downloading it
    # server-side is not something webR can do.
    primary = NOCTURNE[["accent"]], base_font = font_google("Inter", local = FALSE)
  ),
  sidebar = sidebar(
    width = 330,
    selectInput("preset", "Preset", choices = set_names(names(PRESET_LABELS), PRESET_LABELS)),
    do.call(accordion, c(control_panels(), list(open = "Line art", multiple = FALSE)))
  ),
  card(
    card_header("Full wrap — back · spine · front"),
    plotOutput("wrap")
  ),
  layout_columns(
    col_widths = c(7, 5),
    card(
      card_header("Front — trimmed 170 × 240 mm"),
      plotOutput("front")
    ),
    card(
      card_header("Download"),
      card_body(
        uiOutput("fit"),
        downloadButton("svg", "SVG (vector, for the printer)", class = "btn-primary"),
        downloadButton("pdf", "PDF"),
        downloadButton("png", "PNG (300 dpi)"),
        htmlOutput("meta")
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
    updateTextInput(session, str_c("title", i), value = params$title[i] %||% "")
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
    title <- map_chr(seq_len(TITLE_LINES), \(i) input[[str_c("title", i)]] %||% "")
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
      width <- session$clientData[[str_c("output_", id, "_width")]]
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
      str_glue(
        "The title runs {round(overflow, 1)} mm past the front panel's safe ",
        "area. Reduce the title scale or shorten the longest line."
      )
    )
  })

  output$meta <- renderUI({
    dims <- geometry()$dims
    p(
      class = "text-muted small mt-3 mb-0",
      str_glue(
        "Trim 170 × 240 mm · bleed 3 mm · spine {dims$spine} mm · ",
        "wrap {dims$width} × {dims$height} mm · seed {params()$seed}"
      )
    )
  })

  download <- function(format, dpi = 300) {
    downloadHandler(
      filename = \() str_c("thesis-cover.", format),
      content = \(file) cover_save(params(), file, dpi = dpi, format = format)
    )
  }
  output$svg <- download("svg")
  output$pdf <- download("pdf")
  output$png <- download("png")
}

shinyApp(ui, server)
