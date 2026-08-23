# Site Plan: Cyclone Tracks

## Overview
- **Name:** Cyclone Tracks
- **Repo name:** au-cyclones
- **Tagline:** Every tropical cyclone tracked in the Australian region since 1880 — where they formed, where they crossed the coast, and how the record itself has changed.

### Naming Convention
"Cyclone Tracks" — no country code in the name. `country: "AU"` in the index entry renders the flag.

## Target Audience
Australians on the cyclone-exposed coast — Cairns, Townsville, Darwin, Broome, Port Hedland, Karratha, and the south-east Queensland strip that Alfred reminded in March 2025 it is not immune. They arrive for one of three reasons: a storm is coming and they want to know what has hit *here* before; they are researching a property purchase or an insurance renewal; or they remember a storm by name — Tracy, Yasi, Larry, Alfred — and want to see it. Secondary: journalists needing a defensible number in a hurry, and school students doing a geography assignment on tropical cyclones, who are the reason every piece of jargon has a definition attached.

## Value Proposition
The Bureau's own cyclone history is a form you fill in one storm at a time. There is no page anywhere that lets you see all 1,632 tracked systems at once, filter them, rank them, and click through to any single one. This site does that, and adds the thing every other cyclone page leaves out: an honest account of how much of the apparent trend is the weather changing and how much is the *record* changing. A reader can answer "has my stretch of coast been hit, how often, and how hard" in about fifteen seconds.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| IBTrACS v04r01 (NOAA NCEI), Southern Indian basin | `https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.SI.list.v04r01.csv` | Best-track positions, central pressure, wind, gale radii, distance-to-land, landfall | Periodic (NCEI reanalysis) | No |
| IBTrACS v04r01, South Pacific basin | `.../ibtracs.SP.list.v04r01.csv` | As above, east of 135°E | Periodic | No |
| ABS ASGS state boundaries | `patterns/geo/au-states.geojson` | Real coastline/state polygons for the map and for assigning crossings to a state | Static | No |

### Why not the Bureau's own file
BOM publishes the same best-track content as `IDCKMSTM0S.csv`, and it is a nicer file — it carries observed storm-surge, wave and reported-wind fields IBTrACS does not. **We do not use it, and there is no fallback to it.** BOM's copyright terms state that where a page declares no terms of use — and the cyclone database page declares none — you may use the content "for personal use, or use within your organisation" and "must not supply it to any other person", and separately prohibit automated extraction. A public website supplies it to other persons. This was checked by three independent adversarial reviews; two returned FORBIDDEN and none returned PERMITTED.

IBTrACS is the sanctioned route: NCEI states it holds "agreements from the Regional Specialized Meteorological Centers that provide track data to make IBTrACS data open for distribution". BOM is the RSMC for the Australian region, and its analysis reaches the site through the `BOM_*` columns. Cross-validated: Gwenda 900 hPa, George 902, Orson 905, Marcus 905, Yasi 929, Tracy 950 — all identical to the Bureau's own file and to the published records.

## Key Features
1. **Track atlas** — all 1,632 systems as real polylines on a Leaflet map, filterable by season, severity, name and whether they crossed the coast.
2. **Storm dossier** — click any track for its intensity profile, size, duration, landfall and what was and wasn't measured.
3. **120-plus seasons** — per-season counts, severity and crossings, with trends hard-gated to the satellite era.
4. **Coast crossings** — which stretch of coast takes the crossings, ranked, with the named storms behind each.
5. **Records** — deepest, longest-lived, fastest-moving, largest, and the most active seasons.
6. **Anatomy** — size against strength, gale-radius roses, and rapid-intensification episodes.
7. **The record itself** — a metric × decade coverage matrix and a side-by-side of the wind-derived and pressure-derived severity charts, showing why the first one lies.
8. **Search by name** — 528 named storms, each with a deep-linkable dossier.

## Target Audience (detailed)
Mostly phones, often on patchy regional connections, sometimes during a warning when the reader is anxious and wants an answer in seconds — so first paint must be useful and the map must not be the only way in. Tech-savviness is mixed: a Port Hedland shift worker and a Year 9 student and an insurance analyst all land on the same page. Nobody knows what "best track", "Dvorak" or "RSMC" means, so nothing may depend on knowing. The emotional register matters: this is a hazard site, and it must be calm and factual, never dramatic. No red-alert styling, no countdowns, no "monster storm" language.

## Style Direction
**Tone:** calm/reassuring meeting technical/data-dense — a hazard reference, not a news site.
**Colour palette:** light theme on a warm off-white, with a deep ocean-teal accent and a sand/ochre secondary — the Australian tropical coast without resorting to cyclone-warning red. Severity is carried on a single sequential ramp from pale sand (weak) to deep indigo (below 930 hPa); red is reserved exclusively for the one thing that is genuinely a warning, and mostly goes unused. This deliberately avoids the dark "monitoring console" look: a worried resident checking whether Cyclone X's path resembles Yasi's should feel like they are reading the Bureau, not a hacking dashboard.
**UI density:** balanced — dense enough for 1,632 rows, spacious enough to read one-handed on a phone.
**Dark/light theme:** light, with a full dark-mode variant honoured via `prefers-color-scheme`.
**Reference sites for tone:** the Bureau of Meteorology's own warning pages (authority, restraint) and NHC's storm archive (density done calmly).

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (no React — this is one page with six views and a drill-down; a component tree would be overhead)
- **Data strategy:** pipeline. IBTrACS is republished by NCEI periodically, not continuously, so a **monthly** cron is already faster than the source moves. Not realtime: this is a historical archive, and the site says so rather than implying live warnings.
- **Key libraries:** Leaflet 1.9 (npm, never CDN). All charts hand-rolled SVG. `patterns/` supplies the treemap, tooltip, zoom/pan and layout-test templates.

## Layout
Fixed 52px header: title, name search, view tabs, and a `?` for About. Below it a single scrolling main column capped at 1600px. The Atlas view gives the map the full remaining viewport height; every other view is a stack of titled panels. Below 768px the tab strip becomes horizontally scrollable, filter rows collapse into a sheet, and the map takes a fixed 60vh. Sticky footer via the `#app` flex column pattern.

## Pages/Views
Single page, hash-routed: `#atlas`, `#seasons`, `#coast`, `#records`, `#anatomy`, `#record`. Storm drill-down is an overlay at `#atlas&storm=<sid>` so any storm is directly linkable.

## Visualization Strategy

Seven views. Cyclones are moving points, not a hierarchy and not a network — so there is deliberately **no force-directed graph and no Sankey here**. Storms do not connect to each other, and a bipartite graph of storm↔state would be a chart that looks identical for any dataset, which is the failure the brief names. The forms below are chosen for trajectory data specifically.

- **Track atlas (Leaflet polylines)** — the only form that answers "did one come past here". Colour by minimum central pressure, hover any track for its dossier summary, click to open it. Answers a question no table can.
- **Season series + small multiples (SVG)** — 127 seasons as a bar series with a satellite-era trend overlay, plus a 120-cell grid of season mini-tracks. Reveals that the decline is gradual, not a step.
- **Coast crossing ranking (SVG bars + map)** — crossings assigned to a real ABS state polygon by point-in-polygon with nearest-polygon fallback, ranked, each drilling into the named storms behind it. This is the leaderboard the brief requires and the most newsworthy view.
- **Genesis density (SVG hexbin over the map extent)** — where storms are *born*, which is a different and more stable geography than where they hit.
- **Coverage matrix (heatmap)** — metric × decade, the honesty mechanic, drawn as a real cross-reference matrix.
- **Size-vs-strength scatter + gale-radius rose** — the biggest storms are not the strongest, which is genuinely counter-intuitive and only 257 storms can show it, so the view states its own sample size.
- **Intensification histogram** — distribution of 24-hour pressure falls, with rapid-intensification episodes flagged as the anomaly detector.

Every mark gets a `[data-tip]` hover tooltip; Leaflet layers use `bindTooltip`. Dense SVG gets `attachSvgZoom`. Colour for a severity class is identical in every view.
