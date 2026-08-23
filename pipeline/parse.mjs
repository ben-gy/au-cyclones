// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure, dependency-free parsing of IBTrACS v04r01 (NOAA NCEI) for the Australian region.
// Imported by both the pipeline and the test suite, so it must never require a network, a
// package, or the filesystem.
//
// WHY IBTrACS AND NOT THE BUREAU'S OWN FILE
// -----------------------------------------
// The Bureau of Meteorology publishes the same best-track content as IDCKMSTM0S.csv, and it
// is a nicer file. We do not use it. BOM's copyright terms say that where a page states no
// terms of use — and the cyclone database page states none — you may use the content "for
// personal use, or use within your organisation" and "must not supply it to any other
// person", and separately prohibit automated extraction. A public website supplies it to
// other persons. IBTrACS is NOAA NCEI's archive, is US-Government work in the public domain,
// carries BOM's Australian best-track content in its BOM_* columns under NOAA's own
// redistribution terms, and asks only for citation. Do not "fall back" to the BOM file.
//
// THE CENTRAL TRAP THIS FILE EXISTS TO PREVENT
// -------------------------------------------
// Intensity here can be read from pressure or from wind, and wind lies about history:
// wind coverage is a function of when someone was watching, not of how strong storms were.
// Derive a category from wind and the resulting chart shows a catastrophic rise in severe
// cyclones that is pure instrumentation. Every long-run intensity claim on this site is
// computed from central pressure, and each storm records which measures it actually has so
// the UI can draw "not recorded" instead of implying a zero.

/** BOM's official area of responsibility: 90E-160E, southern hemisphere. This is the
 *  definition of "the Australian region" used by the Bureau and by every seasonal outlook,
 *  so it is the one the site states and the one the gates check. */
export const REGION = { lonMin: 90, lonMax: 160, latMax: 0 };

/** Central pressure thresholds in hPa. The official Australian category scale is defined on
 *  WIND, but wind is unusable before 1970 (see above), so the site's long-run severity class
 *  is a PRESSURE class and is labelled as such everywhere it appears. */
export const SEVERE_HPA = 970;
export const PRESSURE_CLASSES = [
  { id: 'extreme', label: 'Below 930 hPa', max: 930 },
  { id: 'severe', label: '930 to 955 hPa', max: 955 },
  { id: 'strong', label: '955 to 970 hPa', max: SEVERE_HPA },
  { id: 'moderate', label: '970 to 990 hPa', max: 990 },
  { id: 'weak', label: 'Above 990 hPa', max: Infinity },
];

/** IBTrACS NATURE codes. 'TS' is the tropical class; a storm counts as a tropical cyclone
 *  for this site if ANY of its points is TS. NR ("not reported") dominates the pre-satellite
 *  record, so excluding it wholesale would silently delete the early decades. */
export const NATURE_LABELS = {
  TS: 'Tropical',
  ET: 'Extratropical',
  SS: 'Subtropical',
  DS: 'Disturbance',
  MX: 'Mixed reports',
  NR: 'Not reported',
};

/** The satellite era. Before geostationary coverage, storms that never approached land or
 *  shipping were simply never seen, so counts before this are detection-limited and no trend
 *  line may cross it. Every trend on the site is hard-gated at this season. */
export const SATELLITE_ERA_START = 1982;

/** IBTrACS wind and pressure are normalised to knots and millibars. Millibars are numerically
 *  identical to hectopascals, which is the unit Australians see in a cyclone warning, so the
 *  site says hPa. Knots are converted once, here, and never mixed with the metres-per-second
 *  the Bureau's own file uses. */
export const KT_TO_KMH = 1.852;

/**
 * Split one CSV line, honouring double-quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** Trim and map blank cells to null so callers never see ''. */
function cell(value) {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Parse a numeric cell to a number or null — never NaN, which survives Math.min and
 *  JSON.stringify and lands in the UI as "NaN hPa". */
export function num(value) {
  const text = cell(value);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * IBTrACS SEASON for the southern hemisphere is the year the season ENDS: Cyclone Tracy
 * struck Darwin in December 1974 and is SEASON=1975. Australians write that season as
 * "1974-75", so a chart labelled with the raw SEASON value is off by one everywhere and a
 * reader checking Tracy against it will find it in the wrong year.
 * @param {number} season IBTrACS SEASON (the end year)
 * @returns {string} e.g. '1974-75'
 */
export function seasonLabel(season) {
  return `${season - 1}-${String(season % 100).padStart(2, '0')}`;
}

/** IBTrACS ISO_TIME is 'YYYY-MM-DD HH:MM:SS' in UTC. Returns epoch ms or null. */
export function parseTime(value) {
  const text = cell(value);
  if (text === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(text);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  return Number.isFinite(ms) ? ms : null;
}

/** Normalise longitude to 0..360 for the region test. IBTrACS emits values east of the
 *  antimeridian as negative, so a naive `lon <= 160` test silently admits the Atlantic. */
export function normaliseLon(lon) {
  let out = lon;
  while (out < 0) out += 360;
  while (out >= 360) out -= 360;
  return out;
}

/**
 * Keep successive track points in one revolution so a polyline never draws the long way
 * around the globe as a stripe across the Pacific.
 */
export function unwrapLon(lon, previous) {
  if (previous === null || previous === undefined) return lon;
  let out = lon;
  while (out - previous > 180) out -= 360;
  while (previous - out > 180) out += 360;
  return out;
}

/** True if a point sits inside BOM's area of responsibility. */
export function inRegion(lat, lon) {
  const l = normaliseLon(lon);
  return lat < REGION.latMax && l >= REGION.lonMin && l <= REGION.lonMax;
}

/** Classify a storm's minimum central pressure. Null pressure yields null, never a class —
 *  an unmeasured storm is not a weak one. */
export function pressureClass(minPressure) {
  if (minPressure === null || minPressure === undefined) return null;
  return PRESSURE_CLASSES.find((c) => minPressure < c.max)?.id ?? 'weak';
}

/**
 * Parse an IBTrACS basin CSV into Australian-region track points.
 *
 * The file has TWO header lines — column names then units — and the units row parses
 * perfectly as data ("degrees_north" in LAT), so a reader that skips only one line gains a
 * phantom track point at latitude NaN in every single storm.
 *
 * @param {string} text
 * @returns {object[]} points in the Australian region
 */
export function parseIbtracsCsv(text) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.startsWith('SID,SEASON,NUMBER,BASIN'));
  if (headerIndex < 0) throw new Error('IBTrACS CSV: header row not found');

  const columns = splitCsvLine(lines[headerIndex]).map((c) => c.trim());
  const index = new Map(columns.map((c, i) => [c, i]));
  const at = (fields, name) => cell(fields[index.get(name) ?? -1]);
  const atNum = (fields, name) => num(fields[index.get(name) ?? -1]);

  const points = [];
  // headerIndex + 1 is the UNITS row; data starts at +2.
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = splitCsvLine(line);
    const sid = at(fields, 'SID');
    if (!sid) continue;

    const lat = atNum(fields, 'LAT');
    const lon = atNum(fields, 'LON');
    if (lat === null || lon === null) continue;
    if (!inRegion(lat, lon)) continue;

    // BOM is the WMO agency of record in this region, so BOM_PRES is both the authoritative
    // value and the better-populated one: it is present on 26,357 rows where WMO_PRES is
    // blank, and where both exist they agree on all but 2 of 30,788 rows.
    const pressure = atNum(fields, 'BOM_PRES') ?? atNum(fields, 'WMO_PRES');
    const wind = atNum(fields, 'BOM_WIND') ?? atNum(fields, 'WMO_WIND');
    const rawName = at(fields, 'NAME');

    points.push({
      sid,
      season: atNum(fields, 'SEASON'),
      basin: at(fields, 'BASIN'),
      // 'UNNAMED' is IBTrACS's null marker. It is not a name and must not become a search hit.
      name: rawName && rawName.toUpperCase() !== 'UNNAMED' ? titleCase(rawName) : null,
      time: parseTime(at(fields, 'ISO_TIME')),
      nature: at(fields, 'NATURE'),
      lat,
      lon: normaliseLon(lon),
      pressure,
      wind,
      gust: atNum(fields, 'BOM_GUST'),
      gustPeriod: atNum(fields, 'BOM_GUST_PER'),
      eye: atNum(fields, 'BOM_EYE'),
      radiusMaxWind: atNum(fields, 'BOM_RMW'),
      // Gale-force (34 kt) radius by quadrant — the storm's SIZE, which is independent of
      // its strength and is what determines how much coast gets hit.
      r34: [
        atNum(fields, 'BOM_R34_NE'),
        atNum(fields, 'BOM_R34_SE'),
        atNum(fields, 'BOM_R34_SW'),
        atNum(fields, 'BOM_R34_NW'),
      ],
      distToLand: atNum(fields, 'DIST2LAND'),
      landfall: atNum(fields, 'LANDFALL'),
      speed: atNum(fields, 'STORM_SPEED'),
      direction: atNum(fields, 'STORM_DIR'),
    });
  }
  return points;
}

/**
 * IBTrACS names are upper case. 'GWENDA' shouted at a reader is not a design choice.
 *
 * A colon joins the names two different warning centres gave the SAME storm as it crossed
 * between their areas — 66 of them in this region, e.g. 'BERTHA:BERTHE'. Left alone that
 * renders as "Bertha:berthe", which reads as a typo and truncates badly on a phone. IBTrACS
 * already writes some of these with a hyphen ('CAROL-DAISY'), so normalising to a hyphen both
 * fixes the casing and makes the two spellings consistent with each other.
 */
export function titleCase(name) {
  return name
    .split(':')
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
    )
    .filter(Boolean)
    .join('-');
}

/**
 * Group Australian-region points into storms, chronologically ordered within each storm.
 * Rows are not guaranteed to be time-ordered within a SID, and an out-of-order polyline
 * renders as a scribble rather than a track.
 *
 * @param {object[]} points
 * @returns {object[]}
 */
export function buildStorms(points) {
  const bySid = new Map();
  for (const p of points) {
    if (!bySid.has(p.sid)) bySid.set(p.sid, []);
    bySid.get(p.sid).push(p);
  }

  const storms = [];
  for (const [sid, raw] of bySid) {
    const pts = [...raw].sort((a, b) => {
      if (a.time !== null && b.time !== null) return a.time - b.time;
      return a.time === null ? 1 : -1;
    });

    let previous = null;
    for (const p of pts) {
      p.lonUnwrapped = unwrapLon(p.lon, previous);
      previous = p.lonUnwrapped;
    }

    const pressures = pts.map((p) => p.pressure).filter((v) => v !== null);
    const winds = pts.map((p) => p.wind).filter((v) => v !== null);
    const gusts = pts.map((p) => p.gust).filter((v) => v !== null);
    const times = pts.map((p) => p.time).filter((v) => v !== null);

    const minPressure = pressures.length ? Math.min(...pressures) : null;
    const season = pts.find((p) => p.season !== null)?.season ?? null;
    const natures = new Set(pts.map((p) => p.nature).filter(Boolean));

    // LANDFALL is the distance to land at the NEXT position, so 0 means the system was over
    // land on the following observation. A storm "crossed the coast" if any point reports 0.
    const crossed = pts.some((p) => p.landfall === 0);
    const landfallPoint = pts.find((p) => p.landfall === 0) ?? null;

    storms.push({
      sid,
      name: pts.find((p) => p.name)?.name ?? null,
      season,
      seasonLabel: season !== null ? seasonLabel(season) : null,
      points: pts,
      pointCount: pts.length,
      natures: [...natures],
      isTropicalCyclone: natures.has('TS'),
      minPressure,
      maxWind: winds.length ? Math.max(...winds) : null,
      maxGust: gusts.length ? Math.max(...gusts) : null,
      pressureClass: pressureClass(minPressure),
      isSevere: minPressure !== null && minPressure <= SEVERE_HPA,
      crossedCoast: crossed,
      landfallLat: landfallPoint ? landfallPoint.lat : null,
      landfallLon: landfallPoint ? landfallPoint.lon : null,
      genesisLat: pts[0]?.lat ?? null,
      genesisLon: pts[0]?.lon ?? null,
      startTime: times.length ? Math.min(...times) : null,
      endTime: times.length ? Math.max(...times) : null,
      durationHours:
        times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 3_600_000) : 0,
      // Which intensity measures exist for this storm. The UI draws "not recorded" from this
      // rather than implying a zero.
      basis: {
        pressure: pressures.length > 0,
        wind: winds.length > 0,
        gust: gusts.length > 0,
        radii: pts.some((p) => p.r34.some((v) => v !== null)),
      },
    });
  }

  storms.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  return storms;
}

/**
 * Per-season aggregates over tropical cyclones only.
 * @param {object[]} storms
 */
export function seasonSummary(storms) {
  const bySeason = new Map();
  for (const s of storms) {
    if (s.season === null || !s.isTropicalCyclone) continue;
    if (!bySeason.has(s.season)) bySeason.set(s.season, []);
    bySeason.get(s.season).push(s);
  }
  return [...bySeason.entries()]
    .map(([season, list]) => {
      const pressures = list.map((s) => s.minPressure).filter((v) => v !== null);
      return {
        season,
        label: seasonLabel(season),
        count: list.length,
        severeCount: list.filter((s) => s.isSevere).length,
        crossings: list.filter((s) => s.crossedCoast).length,
        withPressure: pressures.length,
        deepest: pressures.length ? Math.min(...pressures) : null,
        trackDays: Math.round(list.reduce((sum, s) => sum + s.durationHours, 0) / 24),
      };
    })
    .sort((a, b) => a.season - b.season);
}

/**
 * Ordinary least squares. Returned so every trend claim on the site is computed rather than
 * asserted, and so the tests can pin the numbers the copy quotes.
 */
export function linearTrend(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
  }
  if (varX === 0) return null;
  const slope = cov / varX;
  return { slope, intercept: meanY - slope * meanX, perDecade: slope * 10, n };
}

/** Mean of an array, or null when empty (never NaN). */
export function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
