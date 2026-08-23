# Cyclone Tracks

**Every tropical cyclone tracked in the Australian region since 1880 — where they formed, where they crossed the coast, and how the record itself has changed.**

🔗 **Live:** [https://au-cyclones.benrichardson.dev](https://au-cyclones.benrichardson.dev)

## What is this?

Australia's official cyclone history exists, but you can only read it one storm at a time.
This site puts all **1,632 tracked systems** — 97,378 recorded positions across 127 seasons —
on a single map you can filter, rank, search by name and click into. Every storm has its own
page: its intensity through time, how big it got, how long it lasted, whether it reached land
and where.

The second thing it does is less common. Most cyclone charts you will see are quietly wrong,
because the obvious way to measure a storm's strength — its wind — was not recorded at all
before 1960, and gusts not before 1970. Draw "severe cyclones per decade" from wind and you
get a terrifying upward line that is a record of when instruments arrived, not of what the
weather did. This site measures long-run intensity by **central pressure**, which exists across
the whole archive, and it ships the misleading chart alongside the honest one so you can see
the difference for yourself.

What that honest reading shows: Australian-region cyclones have become **less** frequent, from
about 14.1 a season in 1982–96 to 12.5 in 2012–25, and severe ones have fallen further — 5.8 a
season to 3.8, with the median storm's lowest pressure rising from 970 hPa to 985 hPa. That is
not a measurement artefact, and the site checks rather than assumes it: the share of storms
with a pressure reading *rose* from 80.6% to 91.4% over the same period. The record improved
while the storms weakened. Best-track intensity is still an estimate produced by a technique
that has itself been revised, and the site says so.

## Who is this for?

Australians on the cyclone-exposed coast — Cairns, Townsville, Darwin, Broome, Port Hedland,
Karratha, and the south-east Queensland strip that Cyclone Alfred reminded in March 2025 it is
not immune. Typically arriving for one of three reasons: a storm is coming and they want to
know what has hit *here* before; they are researching a property purchase or an insurance
renewal; or they remember a storm by name — Tracy, Yasi, Larry, Alfred — and want to see it.

Also for journalists who need a defensible number quickly, and for students, which is why every
piece of jargon on the site has a definition attached to it.

**This is a historical archive, not a warning service.** If a cyclone is approaching, the
Bureau of Meteorology is the only source you should act on.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| IBTrACS v04r01 (NOAA NCEI), Southern Indian + South Pacific basins | Best-track positions, central pressure, wind, gale radii, distance to land, landfall | Periodic reanalysis by NCEI; this site rebuilds monthly |
| ABS ASGS state and territory boundaries | Real coastline geometry for the map, and for assigning coast crossings to a jurisdiction | Static |

### Why not the Bureau of Meteorology's own file

BOM publishes the same best-track content directly, and it is a friendlier file — it even
carries observed storm-surge and wave fields IBTrACS lacks. **This project does not use it.**
BOM's copyright terms state that for content whose page declares no terms of use — as the
cyclone database page does — you may use it "for personal use, or use within your organisation"
and "must not supply it to any other person". Publishing a website does exactly that, and being
free and non-commercial does not cure it, because those two prohibitions are independent.

IBTrACS is the sanctioned route: NCEI states it holds agreements from the Regional Specialised
Meteorological Centres that supply its track data allowing open distribution, and the Bureau is
the RSMC for the Australian region — so its analysis reaches this site through the `BOM_*`
columns, with citation. The two agree exactly where they overlap: Gwenda 900 hPa, George 902,
Orson 905, Marcus 905, Yasi 929, Tracy 950. Those six are pinned as build gates.

## Features

- **Track atlas** — all 1,632 systems as real polylines on a Leaflet map, filterable by season, severity, name and whether they crossed the coast. Opens on the satellite era, because 120 years at once is an unreadable tangle.
- **Storm dossier** — click any track for its pressure and wind profile through time, size, duration, landfall, and an explicit list of what was and was not measured.
- **Seasons** — 127 seasons of counts, severity and crossings, with a trend line hard-gated to the satellite era so it can never cross the detection boundary.
- **Coast crossings** — 716 crossings ranked by jurisdiction (Queensland 269, Western Australia 256, Northern Territory 141, New South Wales 10), each drilling into the named storms behind it.
- **Genesis vs landfall** — where storms are born is a different and far more stable geography than where they hit.
- **Records** — deepest, longest-lived, widest, and the fastest-strengthening storms, with a rapid-intensification histogram.
- **Anatomy** — storm size against storm strength, showing the two are related but only loosely (r = 0.42 across the 210 storms with a size measurement).
- **The record** — a metric × decade coverage matrix, and the wind-derived and pressure-derived severity charts side by side.
- **Search by name** — 592 distinct storm names, every one deep-linkable.

## Tech Stack

- **Runtime:** Vanilla TypeScript — one page, six views and a drill-down; a component framework would be overhead
- **Build:** Vite 6
- **Testing:** Vitest — 174 tests
- **Maps:** Leaflet 1.9 (npm, never CDN) with ABS boundary GeoJSON
- **Charts:** hand-rolled SVG; no chart library
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, monthly

## Local Development

```bash
# Install dependencies
npm install

# Fetch IBTrACS and rebuild public/data (~113 MB download, cached in pipeline/cache)
npm run data

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview
```

## How it works

`pipeline/collect.mjs` downloads the two IBTrACS basin CSVs. `pipeline/parse.mjs` — which is
dependency-free and shared with the test suite — filters to the Bureau's area of responsibility
(90°E–160°E, southern hemisphere), groups points into storms, and unwraps longitude so tracks
do not draw the long way around the globe. `pipeline/geo.mjs` places each coast crossing against
real ABS polygons, falling back to the nearest polygon by great-circle distance because a
landfall point is recorded just offshore by construction. `pipeline/aggregate.mjs` writes four
JSON payloads and runs **21 build gates** — the build fails if any of them does.

The gates are the interesting part. Six check named storms against their published central
pressures. Others assert that every point is inside the region, that no track jumps the
antimeridian, that severe-storm counts never exceed measured-storm counts, that the state
crossing table reconciles with the storm index, and — the one the site's headline depends on —
that pressure coverage did not fall across the satellite era. If coverage had fallen, the
observed decline in severe storms would be a measurement artefact and the site would have no
business printing it.

One trap worth naming: IBTrACS publishes the current season's positions long before it analyses
their intensity. At build time the 2025-26 season had 15 systems, every one with no pressure at
all. Charted naively that is a spectacular collapse to zero cyclones in the most recent season,
which reads as a finding and is an archive backlog. The pipeline detects the boundary
automatically, holds those seasons out of every count and trend, and still shows them on the map
labelled "not yet analysed" so anyone searching for a recent storm by name still finds it.

Geometry and intensity ship as separate payloads: the map needs coordinates on arrival, and
pressure/wind/timing are only read inside a dossier, so they load on the first drill-down. First
paint is about 414 KB gzipped instead of 566 KB.

## License

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

A separate commercial licence without the AGPL's source-disclosure obligations is
available on request: <hi@ben.gy>.

Third-party components keep their own licences — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
Data sources keep theirs, and their attribution requirements are listed in the site's
own About panel and in [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).
