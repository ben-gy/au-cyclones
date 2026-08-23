// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The shipped JSON must honour the pipeline's contract. These run against the files that
// actually go to production, so a pipeline change that quietly breaks the site fails CI.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchStorms, toLatLngs } from '../src/data';
import type { Meta, SeasonsPayload, Storm } from '../src/types';

const ROOT = join(import.meta.dirname, '..');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(ROOT, 'public/data', name), 'utf8')) as T;

const meta = load<Meta>('meta.json');
const storms = load<Storm[]>('storms.json');
const tracks = load<Record<string, number[]>>('tracks.json');
const seasons = load<SeasonsPayload>('seasons.json');

describe('build gates', () => {
  it('all passed at build time', () => {
    const failed = meta.gates.filter((g) => !g.pass && !g.advisory);
    expect(failed.map((g) => g.name)).toEqual([]);
  });

  it('there are enough of them to be worth having', () => {
    expect(meta.gates.length).toBeGreaterThanOrEqual(15);
  });

  it('includes the published-record anchors', () => {
    // Six named storms checked against their published central pressures. If the upstream
    // archive is reanalysed, this fires rather than shipping a changed number silently.
    for (const name of ['Gwenda', 'Yasi', 'Tracy', 'Orson', 'Marcus', 'George']) {
      expect(meta.gates.some((g) => g.name === `anchor:${name}` && g.pass)).toBe(true);
    }
  });

  it('includes the check the headline depends on', () => {
    const gate = meta.gates.find((g) => g.name === 'headline:pressure coverage did not fall');
    expect(gate?.pass).toBe(true);
  });
});

describe('coverage of the whole archive', () => {
  it('ships the full record rather than a sample', () => {
    expect(storms.length).toBeGreaterThan(1500);
    expect(meta.counts.points).toBeGreaterThan(90_000);
    expect(seasons.seasons.length).toBeGreaterThanOrEqual(120);
  });

  it('has a track for every storm with more than one fix', () => {
    const missing = storms.filter((s) => s.points > 1 && !tracks[s.sid]);
    expect(missing.map((s) => s.sid)).toEqual([]);
  });

  it('stores coordinates as flat pairs', () => {
    for (const track of Object.values(tracks)) {
      expect(track.length % 2, 'a flat coordinate array must have even length').toBe(0);
    }
  });

  it('rehydrates a track to the storm’s own fix count', () => {
    const storm = storms.find((s) => s.points > 5 && tracks[s.sid])!;
    expect(toLatLngs(tracks[storm.sid])).toHaveLength(storm.points);
  });
});

describe('coordinates', () => {
  // 97,000 points: gather offenders and assert ONCE. An expect() per point turns a
  // millisecond check into a minute of CI, and the failure message is no better for it.
  const entries = Object.entries(tracks);

  it('are all inside the Australian region', () => {
    const bad: string[] = [];
    for (const [sid, track] of entries) {
      for (let i = 0; i + 1 < track.length; i += 2) {
        if (!(Number.isFinite(track[i]) && track[i] < 0)) bad.push(`${sid}@${i}`);
      }
    }
    expect(bad.slice(0, 5), `${bad.length} non-southern latitudes`).toEqual([]);
  });

  it('contain no NaN, which JSON silently turns into null', () => {
    const bad = entries.filter(([, track]) => track.some((v) => v === null || !Number.isFinite(v)));
    expect(bad.map(([sid]) => sid).slice(0, 5)).toEqual([]);
  });

  it('never jump more than 180 degrees between consecutive fixes', () => {
    // A jump means the antimeridian unwrap failed and Leaflet will draw a stripe across the
    // Pacific instead of a track.
    const bad: string[] = [];
    for (const [sid, track] of entries) {
      for (let i = 3; i < track.length; i += 2) {
        if (Math.abs(track[i] - track[i - 2]) > 180) bad.push(sid);
      }
    }
    expect(bad.slice(0, 5), `${bad.length} antimeridian jumps`).toEqual([]);
  });
});

describe('the provisional season is held back', () => {
  it('is excluded from the season table', () => {
    for (const row of seasons.seasons) {
      expect(row.season).toBeLessThanOrEqual(meta.completeThroughSeason);
    }
  });

  it('is still present in the storm index, flagged, so a reader can find it by name', () => {
    // The point is to exclude it from COUNTS, not to hide it. Someone searching for a storm
    // from the current season must still find their storm.
    const provisional = storms.filter((s) => s.provisional);
    expect(provisional.length).toBeGreaterThan(0);
    for (const storm of provisional) {
      expect(storm.season).toBeGreaterThan(meta.completeThroughSeason);
    }
  });

  it('never contributes a measured intensity, which is why it is held back', () => {
    for (const storm of storms.filter((s) => s.provisional)) {
      expect(storm.minPressure).toBeNull();
    }
  });
});

describe('null is never read as zero', () => {
  it('gives an unmeasured storm no pressure class', () => {
    for (const storm of storms) {
      if (storm.minPressure === null) expect(storm.cls).toBeNull();
      else expect(storm.cls).not.toBeNull();
    }
  });

  it('never marks an unmeasured storm as severe', () => {
    // The site's central mistake in miniature: a null read as 0 would make every unmeasured
    // storm the most intense on record.
    for (const storm of storms) {
      if (storm.minPressure === null) expect(storm.severe).toBe(false);
    }
  });

  it('keeps severe counts within measured counts in every season', () => {
    for (const row of seasons.seasons) {
      expect(row.severeCount).toBeLessThanOrEqual(row.withPressure);
      expect(row.withPressure).toBeLessThanOrEqual(row.count);
    }
  });
});

describe('the headline the site prints', () => {
  const [early, , late] = meta.eras;

  it('is computed from three comparable eras', () => {
    expect(meta.eras).toHaveLength(3);
    for (const era of meta.eras) expect(era.storms).toBeGreaterThan(100);
  });

  it('shows cyclone frequency falling', () => {
    expect(late.perSeason).toBeLessThan(early.perSeason);
  });

  it('shows severe cyclones falling further, in proportion', () => {
    const allDrop = (early.perSeason - late.perSeason) / early.perSeason;
    const severeDrop = (early.severePerSeason - late.severePerSeason) / early.severePerSeason;
    expect(severeDrop).toBeGreaterThan(allDrop);
  });

  it('rests on IMPROVING coverage, which is what makes it a signal and not an artefact', () => {
    // If coverage had fallen, severe storms would be going missing rather than not happening,
    // and the site must not print the claim. This is the refutation, pinned.
    expect(late.coverage).toBeGreaterThanOrEqual(early.coverage);
  });

  it('is corroborated by the median storm getting weaker', () => {
    expect(late.medianMinPressure!).toBeGreaterThan(early.medianMinPressure!);
  });

  it('quotes a trend fitted only to analysed satellite-era seasons', () => {
    expect(meta.trend.from).toBe(meta.satelliteEraStart);
    expect(meta.trend.to).toBe(meta.completeThroughSeason);
    expect(meta.trend.countPerDecade).toBeLessThan(0);
  });
});

describe('the record-quality view has something to show', () => {
  it('has decades where gusts are entirely absent but pressure is not', () => {
    // This is the whole argument of that view: if every decade had gust data, the
    // wind-derived chart would not be misleading and the view would have no point.
    const gustless = seasons.decades.filter((d) => d.gust === 0 && d.pressure > 50);
    expect(gustless.length).toBeGreaterThan(2);
  });

  it('has gusts pinned to exactly zero for several consecutive early decades', () => {
    // This is the mechanism of the artefact: not "fewer gusts", but none at all, regardless
    // of how violent those decades' storms were.
    const gustless = seasons.severityTwoWays.filter((d) => d.byGust === 0);
    expect(gustless.length).toBeGreaterThanOrEqual(5);
    // ...and they must be the EARLY ones, contiguously — if they were scattered, the story
    // would be missing data rather than a change in instrumentation.
    const firstWithGust = seasons.severityTwoWays.findIndex((d) => d.byGust > 0);
    expect(firstWithGust).toBeGreaterThan(4);
    for (const decade of seasons.severityTwoWays.slice(0, firstWithGust)) {
      expect(decade.byGust).toBe(0);
      // and those same decades DO have pressure readings, which is what makes the comparison
      // possible at all
      expect(decade.storms).toBeGreaterThan(0);
    }
  });

  it('puts the two measures’ peaks in different decades — the point of the view', () => {
    // The gust series peaks recently (instruments arrived); the pressure series peaks earlier
    // and has since fallen. If both peaked in the same decade the view would have no argument.
    const byGustPeak = [...seasons.severityTwoWays].sort((a, b) => b.byGust - a.byGust)[0];
    const byPressurePeak = [...seasons.severityTwoWays].sort((a, b) => b.byPressure - a.byPressure)[0];
    expect(byGustPeak.decade).not.toBe(byPressurePeak.decade);
    expect(byGustPeak.decade).toBeGreaterThan(byPressurePeak.decade);
  });

  it('shows the pressure-derived count falling from its peak to the present', () => {
    const rows = seasons.severityTwoWays;
    const peak = [...rows].sort((a, b) => b.byPressure - a.byPressure)[0];
    expect(rows[rows.length - 1].byPressure).toBeLessThan(peak.byPressure);
  });
});

describe('attribution survives in the data', () => {
  it('names IBTrACS, NOAA and the originating Bureau analysis', () => {
    expect(meta.source.ibtracs.product).toMatch(/IBTrACS/);
    expect(meta.source.ibtracs.publisher).toMatch(/NOAA/);
    expect(meta.source.ibtracs.originatingAgency).toMatch(/Bureau of Meteorology/);
    expect(meta.source.ibtracs.citation).toMatch(/Gahtan/);
    expect(meta.source.ibtracs.paper).toMatch(/Knapp/);
  });

  it('names the boundary licence', () => {
    expect(meta.source.boundaries.licence).toBe('CC BY 4.0');
    expect(meta.source.boundaries.publisher).toMatch(/Australian Bureau of Statistics/);
  });
});

describe('name search', () => {
  it('finds a storm people actually search for', () => {
    const hits = searchStorms(storms, 'yasi');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].name).toBe('Yasi');
    expect(hits[0].seasonLabel).toBe('2010-11');
  });

  it('is case insensitive and ranks prefix matches first', () => {
    const hits = searchStorms(storms, 'tra');
    expect(hits[0].name?.toLowerCase().startsWith('tra')).toBe(true);
  });

  it('ignores a query that is too short to be useful', () => {
    expect(searchStorms(storms, 'a')).toEqual([]);
    expect(searchStorms(storms, '')).toEqual([]);
  });

  it('never returns an unnamed system', () => {
    for (const hit of searchStorms(storms, 'un')) expect(hit.name).not.toBeNull();
  });

  it('finds a storm from the not-yet-analysed season', () => {
    const provisional = storms.find((s) => s.provisional && s.name);
    expect(provisional).toBeDefined();
    expect(searchStorms(storms, provisional!.name!.toLowerCase()).length).toBeGreaterThan(0);
  });
});
