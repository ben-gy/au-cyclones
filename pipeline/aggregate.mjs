// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Turn the cached IBTrACS basin files into the JSON the site loads. Runs the gates in
// gates.mjs and exits non-zero if any non-advisory gate fails, so a bad build never ships.

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SATELLITE_ERA_START,
  SEVERE_HPA,
  PRESSURE_CLASSES,
  buildStorms,
  linearTrend,
  mean,
  parseIbtracsCsv,
  seasonSummary,
} from './parse.mjs';
import { buildStateLocator } from './geo.mjs';
import { runGates } from './gates.mjs';
import { SOURCES } from './sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'pipeline', 'cache');
const OUT = join(ROOT, 'public', 'data');
const FACTORY_GEO = join(ROOT, '..', '..', 'patterns', 'geo', 'au-states.geojson');

/** Round to a fixed number of decimals, preserving null. Track coordinates at 2 decimals are
 *  ~1.1 km, far finer than best-track position uncertainty, and it halves the payload. */
const round = (value, dp = 2) =>
  value === null || value === undefined ? null : Number(value.toFixed(dp));

async function main() {
  await mkdir(OUT, { recursive: true });

  // --- Parse -------------------------------------------------------------------------
  let points = [];
  for (const file of SOURCES.ibtracs.files) {
    const text = await readFile(join(CACHE, file.name), 'utf8');
    const parsed = parseIbtracsCsv(text);
    process.stdout.write(`  ${file.name}: ${parsed.length.toLocaleString()} points in region\n`);
    points = points.concat(parsed);
  }

  const storms = buildStorms(points);
  const orderedPoints = storms.flatMap((s) => s.points);
  process.stdout.write(`  ${storms.length} systems, ${orderedPoints.length.toLocaleString()} points\n`);

  // --- Where the analysed record actually ends ---------------------------------------
  // IBTrACS publishes positions for the running season long before it analyses intensity.
  // Those seasons must not enter a count chart: fifteen systems with no pressure at all
  // would draw as a collapse to zero. The analysed record ends at the last season where a
  // majority of systems carry a central pressure.
  const allSeasons = seasonSummary(storms);
  let completeThroughSeason = null;
  for (const s of allSeasons) {
    if (s.count > 0 && s.withPressure / s.count >= 0.5) completeThroughSeason = s.season;
  }
  const provisionalSeasons = [
    ...new Set(
      storms
        .filter((s) => s.season !== null && s.season > completeThroughSeason)
        .map((s) => s.season)
    ),
  ].sort();

  // --- Locate coast crossings against real ABS geometry ------------------------------
  const boundaries = JSON.parse(await readFile(FACTORY_GEO, 'utf8'));
  const locate = buildStateLocator(boundaries);
  for (const storm of storms) {
    storm.landfallState = null;
    storm.landfallStateName = null;
    if (!storm.crossedCoast || storm.landfallLat === null) continue;
    const hit = locate(storm.landfallLat, storm.landfallLon);
    if (hit) {
      storm.landfallState = hit.code;
      storm.landfallStateName = hit.name;
    }
  }

  const byState = {};
  for (const storm of storms) {
    if (!storm.landfallState) continue;
    const entry = (byState[storm.landfallState] ??= {
      code: storm.landfallState,
      name: storm.landfallStateName,
      crossings: 0,
      severeCrossings: 0,
      deepest: null,
      deepestStorm: null,
      firstSeason: null,
      lastSeason: null,
    });
    entry.crossings += 1;
    if (storm.isSevere) entry.severeCrossings += 1;
    if (storm.minPressure !== null && (entry.deepest === null || storm.minPressure < entry.deepest)) {
      entry.deepest = storm.minPressure;
      entry.deepestStorm = storm.name ?? 'Unnamed';
    }
    if (storm.season !== null) {
      entry.firstSeason = entry.firstSeason === null ? storm.season : Math.min(entry.firstSeason, storm.season);
      entry.lastSeason = entry.lastSeason === null ? storm.season : Math.max(entry.lastSeason, storm.season);
    }
  }

  // --- Headline numbers, computed rather than asserted -------------------------------
  const tropical = storms.filter((s) => s.isTropicalCyclone);
  const analysed = allSeasons.filter(
    (s) => s.season >= SATELLITE_ERA_START && s.season <= completeThroughSeason
  );
  const trendCount = linearTrend(analysed.map((s) => s.season), analysed.map((s) => s.count));
  const trendSevere = linearTrend(analysed.map((s) => s.season), analysed.map((s) => s.severeCount));

  const eraStats = (lo, hi) => {
    const list = tropical.filter((s) => s.season >= lo && s.season <= hi);
    const measured = list.filter((s) => s.minPressure !== null);
    const sorted = measured.map((s) => s.minPressure).sort((a, b) => a - b);
    return {
      from: lo,
      to: hi,
      label: `${lo}-${String(hi % 100).padStart(2, '0')}`,
      seasons: hi - lo + 1,
      storms: list.length,
      perSeason: Number((list.length / (hi - lo + 1)).toFixed(2)),
      measured: measured.length,
      coverage: Number(((100 * measured.length) / list.length).toFixed(1)),
      severe: list.filter((s) => s.isSevere).length,
      severePerSeason: Number((list.filter((s) => s.isSevere).length / (hi - lo + 1)).toFixed(2)),
      severeShareOfMeasured: Number(
        ((100 * measured.filter((s) => s.isSevere).length) / measured.length).toFixed(1)
      ),
      medianMinPressure: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    };
  };
  const eras = [eraStats(1982, 1996), eraStats(1997, 2011), eraStats(2012, completeThroughSeason)];

  // --- Metric coverage by decade — the honesty mechanic ------------------------------
  const decades = [];
  for (let d = 1900; d <= 2020; d += 10) {
    const list = tropical.filter((s) => s.season >= d && s.season < d + 10);
    if (!list.length) continue;
    decades.push({
      decade: d,
      label: `${d}s`,
      storms: list.length,
      pressure: Number(((100 * list.filter((s) => s.basis.pressure).length) / list.length).toFixed(0)),
      wind: Number(((100 * list.filter((s) => s.basis.wind).length) / list.length).toFixed(0)),
      gust: Number(((100 * list.filter((s) => s.basis.gust).length) / list.length).toFixed(0)),
      radii: Number(((100 * list.filter((s) => s.basis.radii).length) / list.length).toFixed(0)),
    });
  }

  // --- The refutation view: the same question answered two ways -----------------------
  // Severe-storm counts per decade derived from GUST (which is a record of who was watching)
  // against the same counts derived from PRESSURE. The first shows a catastrophic rise that
  // is pure instrumentation. Shipping both, side by side, is the point.
  const severityTwoWays = decades.map((d) => {
    const list = tropical.filter((s) => s.season >= d.decade && s.season < d.decade + 10);
    return {
      decade: d.decade,
      label: d.label,
      // 64 kt sustained is the Australian severe-category threshold; as a GUST proxy this is
      // deliberately the naive reading a builder would reach for.
      byGust: list.filter((s) => s.maxGust !== null && s.maxGust >= 90).length,
      byPressure: list.filter((s) => s.isSevere).length,
      storms: list.length,
    };
  });

  // --- Rapid intensification: the anomaly detector ------------------------------------
  // A 24-hour fall of 42 hPa or more is the conventional rapid-intensification threshold in
  // pressure terms. Computed from real elapsed time between points, never from an assumed
  // six-hourly grid — the archive's spacing varies by era and by storm.
  const intensification = [];
  for (const storm of storms) {
    const measured = storm.points.filter((p) => p.pressure !== null && p.time !== null);
    let best = null;
    for (let i = 0; i < measured.length; i += 1) {
      for (let j = i + 1; j < measured.length; j += 1) {
        const hours = (measured[j].time - measured[i].time) / 3_600_000;
        if (hours > 24) break;
        const drop = measured[i].pressure - measured[j].pressure;
        if (hours >= 12 && (best === null || drop > best.drop)) {
          best = { drop, hours: Number(hours.toFixed(1)) };
        }
      }
    }
    if (best && best.drop > 0) {
      intensification.push({
        sid: storm.sid,
        name: storm.name,
        season: storm.season,
        seasonLabel: storm.seasonLabel,
        drop: Number(best.drop.toFixed(1)),
        hours: best.hours,
        minPressure: storm.minPressure,
      });
    }
  }
  intensification.sort((a, b) => b.drop - a.drop);

  // --- Emit ---------------------------------------------------------------------------
  const stormIndex = storms.map((s) => ({
    sid: s.sid,
    name: s.name,
    season: s.season,
    seasonLabel: s.seasonLabel,
    minPressure: s.minPressure,
    maxWind: s.maxWind,
    maxGust: s.maxGust,
    cls: s.pressureClass,
    severe: s.isSevere,
    tropical: s.isTropicalCyclone,
    crossed: s.crossedCoast,
    state: s.landfallState,
    stateName: s.landfallStateName,
    lfLat: round(s.landfallLat),
    lfLon: round(s.landfallLon),
    genLat: round(s.genesisLat),
    genLon: round(s.genesisLon),
    points: s.pointCount,
    hours: s.durationHours,
    start: s.startTime,
    end: s.endTime,
    provisional: s.season !== null && s.season > completeThroughSeason,
    basis: s.basis,
    // Largest mean gale radius reached, in nautical miles — the storm's SIZE.
    galeRadius: (() => {
      const means = s.points
        .map((p) => {
          const vals = p.r34.filter((v) => v !== null && v > 0);
          return vals.length === 4 ? mean(vals) : null;
        })
        .filter((v) => v !== null);
      return means.length ? Number(Math.max(...means).toFixed(0)) : null;
    })(),
  }));

  // Geometry and intensity are split into two payloads on purpose. The audience for this
  // site is often on a regional connection during a warning, and the map is the first thing
  // they need. Geometry alone is what the map draws; pressure, wind and timing are only ever
  // read inside a storm dossier, so they load on the first drill-down instead of on arrival.
  //
  // Coordinates are flattened into ONE array per storm rather than an array of pairs:
  // [lat0, lon0, lat1, lon1, ...]. 97,000 two-element arrays cost about 400 KB of JSON
  // punctuation on their own.
  const tracks = {};
  for (const s of storms) {
    const flat = [];
    for (const p of s.points) {
      flat.push(round(p.lat), round(p.lonUnwrapped));
    }
    tracks[s.sid] = flat;
  }

  // Per-point intensity, aligned index-for-index with the coordinate pairs above.
  const profiles = {};
  for (const s of storms) {
    profiles[s.sid] = {
      // Time is stored as minutes since the storm's own first fix. Absolute epoch
      // milliseconds are 13 digits each and the dossier only ever needs elapsed time.
      t: s.points.map((p) => (p.time === null || s.startTime === null ? null : Math.round((p.time - s.startTime) / 60_000))),
      p: s.points.map((p) => p.pressure),
      w: s.points.map((p) => p.wind),
      n: s.points.map((p) => p.nature),
      r: s.points.map((p) => {
        const vals = p.r34.filter((v) => v !== null && v > 0);
        return vals.length === 4 ? Number(mean(vals).toFixed(0)) : null;
      }),
    };
  }

  const meta = {
    generated: new Date().toISOString(),
    completeThroughSeason,
    completeThroughLabel: allSeasons.find((s) => s.season === completeThroughSeason)?.label ?? null,
    provisionalSeasons,
    satelliteEraStart: SATELLITE_ERA_START,
    severeHpa: SEVERE_HPA,
    pressureClasses: PRESSURE_CLASSES.map(({ id, label, max }) => ({
      id,
      label,
      max: max === Infinity ? null : max,
    })),
    counts: {
      systems: storms.length,
      tropical: tropical.length,
      named: storms.filter((s) => s.name).length,
      distinctNames: new Set(storms.filter((s) => s.name).map((s) => s.name)).size,
      points: orderedPoints.length,
      crossings: storms.filter((s) => s.crossedCoast).length,
      seasons: allSeasons.length,
      withRadii: storms.filter((s) => s.basis.radii).length,
    },
    firstSeasonLabel: allSeasons[0]?.label ?? null,
    trend: {
      from: SATELLITE_ERA_START,
      to: completeThroughSeason,
      countPerDecade: trendCount ? Number(trendCount.perDecade.toFixed(2)) : null,
      severePerDecade: trendSevere ? Number(trendSevere.perDecade.toFixed(2)) : null,
    },
    eras,
    source: {
      ibtracs: {
        publisher: SOURCES.ibtracs.publisher,
        product: SOURCES.ibtracs.product,
        licence: SOURCES.ibtracs.licence,
        citation: SOURCES.ibtracs.citation,
        paper: SOURCES.ibtracs.paper,
        originatingAgency: SOURCES.ibtracs.originatingAgency,
        homepage: SOURCES.ibtracs.homepage,
      },
      boundaries: {
        publisher: SOURCES.boundaries.publisher,
        product: SOURCES.boundaries.product,
        licence: SOURCES.boundaries.licence,
      },
    },
    gates: [],
  };

  const { gates, failed } = runGates({
    storms,
    seasons: allSeasons,
    points: orderedPoints,
    byState,
    meta,
  });
  meta.gates = gates;

  for (const g of gates) {
    const mark = g.pass ? 'PASS' : g.advisory ? 'WARN' : 'FAIL';
    process.stdout.write(`  [${mark}] ${g.name} — ${g.detail}\n`);
  }

  await writeFile(join(OUT, 'storms.json'), JSON.stringify(stormIndex));
  await writeFile(join(OUT, 'tracks.json'), JSON.stringify(tracks));
  await writeFile(join(OUT, 'profiles.json'), JSON.stringify(profiles));
  await writeFile(
    join(OUT, 'seasons.json'),
    JSON.stringify({
      seasons: allSeasons,
      byState: Object.values(byState).sort((a, b) => b.crossings - a.crossings),
      decades,
      severityTwoWays,
      intensification: intensification.slice(0, 60),
    })
  );
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  await copyFile(FACTORY_GEO, join(OUT, 'au-states.geojson'));

  if (failed.length) {
    process.stderr.write(`\naggregate FAILED ${failed.length} gate(s):\n`);
    for (const g of failed) process.stderr.write(`  - ${g.name}: ${g.detail}\n`);
    process.exit(1);
  }
  process.stdout.write(`\naggregate: ok — analysed record ends ${meta.completeThroughLabel}\n`);
}

main().catch((error) => {
  process.stderr.write(`aggregate failed: ${error.stack}\n`);
  process.exit(1);
});
