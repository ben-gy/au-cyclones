// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Parser tests. Several of these encode a trap that was found by hand against the real
// archive and would be invisible in any output that merely "looks plausible".

import { describe, expect, it } from 'vitest';
// @ts-expect-error — dependency-free .mjs shared with the pipeline
import * as parse from '../pipeline/parse.mjs';

const HEADER =
  'SID,SEASON,NUMBER,BASIN,SUBBASIN,NAME,ISO_TIME,NATURE,LAT,LON,WMO_WIND,WMO_PRES,BOM_PRES,BOM_WIND,BOM_GUST,BOM_GUST_PER,BOM_EYE,BOM_RMW,BOM_R34_NE,BOM_R34_SE,BOM_R34_SW,BOM_R34_NW,DIST2LAND,LANDFALL,STORM_SPEED,STORM_DIR';
const UNITS =
  ',Year,,,,,,,degrees_north,degrees_east,kts,mb,mb,kts,kts,second,nmile,nmile,nmile,nmile,nmile,nmile,km,km,kts,degrees';

function csv(...rows: string[]): string {
  return [HEADER, UNITS, ...rows].join('\n');
}

/** A row builder with sensible defaults so each test states only what it is testing. */
function row(overrides: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    SID: '2011031S12141',
    SEASON: '2011',
    NUMBER: '3',
    BASIN: 'SP',
    SUBBASIN: 'EA',
    NAME: 'YASI',
    ISO_TIME: '2011-02-02 12:00:00',
    NATURE: 'TS',
    LAT: '-17.5',
    LON: '146.0',
    WMO_WIND: '110',
    WMO_PRES: '929',
    BOM_PRES: '929',
    BOM_WIND: '110',
    BOM_GUST: '155',
    BOM_GUST_PER: '155',
    BOM_EYE: '20',
    BOM_RMW: '15',
    BOM_R34_NE: '120',
    BOM_R34_SE: '110',
    BOM_R34_SW: '100',
    BOM_R34_NW: '115',
    DIST2LAND: '0',
    LANDFALL: '0',
    STORM_SPEED: '15',
    STORM_DIR: '260',
  };
  const merged = { ...base, ...overrides };
  return HEADER.split(',')
    .map((c) => merged[c] ?? '')
    .join(',');
}

describe('the units row is not data', () => {
  it('skips the second header line', () => {
    // "degrees_north" in LAT parses as NaN, not as a number, so a reader that skips only one
    // line gains a phantom track point in every storm rather than throwing.
    const { length } = parse.parseIbtracsCsv(csv(row()));
    expect(length).toBe(1);
  });

  it('throws rather than guessing when the header is missing', () => {
    expect(() => parse.parseIbtracsCsv('nothing,useful\n1,2')).toThrow(/header row not found/);
  });
});

describe('the Australian region filter', () => {
  it('keeps points inside 90-160E, southern hemisphere', () => {
    expect(parse.inRegion(-17.5, 146)).toBe(true);
    expect(parse.inRegion(-20, 90)).toBe(true);
    expect(parse.inRegion(-20, 160)).toBe(true);
  });

  it('excludes the northern hemisphere and other basins', () => {
    expect(parse.inRegion(17.5, 146)).toBe(false);
    expect(parse.inRegion(-20, 60)).toBe(false);
    expect(parse.inRegion(-20, 170)).toBe(false);
  });

  it('does not admit the Atlantic through a negative longitude', () => {
    // IBTrACS writes longitudes east of the antimeridian as negative. A naive `lon <= 160`
    // test passes for -60 (the South Atlantic) and quietly fills the map with the wrong ocean.
    expect(parse.inRegion(-20, -60)).toBe(false);
    expect(parse.normaliseLon(-60)).toBe(300);
  });

  it('drops out-of-region rows at parse time', () => {
    const points = parse.parseIbtracsCsv(csv(row(), row({ LON: '60.0', SID: 'X' })));
    expect(points).toHaveLength(1);
    expect(points[0].sid).toBe('2011031S12141');
  });
});

describe('season arithmetic', () => {
  it('labels a southern-hemisphere season by the year it starts', () => {
    // IBTrACS SEASON is the year the season ENDS. Cyclone Tracy struck Darwin in December
    // 1974 and is SEASON=1975; Australians call that the 1974-75 season.
    expect(parse.seasonLabel(1975)).toBe('1974-75');
    expect(parse.seasonLabel(2011)).toBe('2010-11');
  });

  it('pads the century rollover', () => {
    expect(parse.seasonLabel(2000)).toBe('1999-00');
    expect(parse.seasonLabel(2005)).toBe('2004-05');
  });
});

describe('null handling', () => {
  it('returns null, never NaN, for an unparseable number', () => {
    // NaN survives Math.min and JSON.stringify and reaches the UI as "NaN hPa".
    expect(parse.num('')).toBeNull();
    expect(parse.num('   ')).toBeNull();
    expect(parse.num('not a number')).toBeNull();
    expect(parse.num('929')).toBe(929);
    expect(parse.num('-17.5')).toBe(-17.5);
  });

  it('treats a blank pressure as unmeasured rather than as zero', () => {
    const points = parse.parseIbtracsCsv(csv(row({ BOM_PRES: '', WMO_PRES: '' })));
    expect(points[0].pressure).toBeNull();
  });

  it('falls back from BOM pressure to the WMO value', () => {
    const points = parse.parseIbtracsCsv(csv(row({ BOM_PRES: '', WMO_PRES: '931' })));
    expect(points[0].pressure).toBe(931);
  });

  it('never classifies an unmeasured storm', () => {
    // The site's central mistake in miniature: a null pressure read as 0 would classify every
    // unmeasured storm as the most intense possible.
    expect(parse.pressureClass(null)).toBeNull();
    expect(parse.pressureClass(900)).toBe('extreme');
    expect(parse.pressureClass(970)).toBe('moderate');
    expect(parse.pressureClass(1000)).toBe('weak');
  });
});

describe("'UNNAMED' is a null marker, not a name", () => {
  it('does not turn UNNAMED into a searchable storm name', () => {
    expect(parse.parseIbtracsCsv(csv(row({ NAME: 'UNNAMED' })))[0].name).toBeNull();
  });

  it('title-cases real names rather than shouting them', () => {
    expect(parse.parseIbtracsCsv(csv(row({ NAME: 'YASI' })))[0].name).toBe('Yasi');
    expect(parse.titleCase('TROPICAL LOW')).toBe('Tropical Low');
  });

  it('normalises the colon that joins two warning centres’ names for one storm', () => {
    // 66 storms in this region carry a dual-agency name. Untouched they render as
    // "Bertha:berthe", which reads as a typo — and IBTrACS itself writes some of them with a
    // hyphen already, so the two spellings would be inconsistent.
    expect(parse.titleCase('BERTHA:BERTHE')).toBe('Bertha-Berthe');
    expect(parse.titleCase('AMANDA:GISELE')).toBe('Amanda-Gisele');
    expect(parse.titleCase('CAROL-DAISY')).toBe('Carol-Daisy');
    expect(parse.titleCase('GWENDA')).toBe('Gwenda');
  });
});

describe('longitude unwrapping', () => {
  it('keeps a track continuous across the antimeridian', () => {
    // Without this, Leaflet draws the polyline the long way round the globe: a horizontal
    // stripe straight across the Pacific.
    expect(parse.unwrapLon(179, 178)).toBe(179);
    expect(parse.unwrapLon(-179, 179)).toBe(181);
    expect(parse.unwrapLon(179, -179)).toBe(-181);
  });

  it('leaves the first point alone', () => {
    expect(parse.unwrapLon(146, null)).toBe(146);
  });

  it('never produces a step larger than 180 degrees', () => {
    const points = [175, -175, 170, -170].reduce<number[]>((acc, lon) => {
      acc.push(parse.unwrapLon(lon, acc.length ? acc[acc.length - 1] : null));
      return acc;
    }, []);
    for (let i = 1; i < points.length; i += 1) {
      expect(Math.abs(points[i] - points[i - 1])).toBeLessThanOrEqual(180);
    }
  });
});

describe('storm assembly', () => {
  it('orders track points chronologically regardless of file order', () => {
    // Rows are not guaranteed time-ordered within a SID, and an out-of-order polyline renders
    // as a scribble rather than a track.
    const storms = parse.buildStorms(
      parse.parseIbtracsCsv(
        csv(
          row({ ISO_TIME: '2011-02-03 12:00:00', BOM_PRES: '940' }),
          row({ ISO_TIME: '2011-02-01 12:00:00', BOM_PRES: '990' }),
          row({ ISO_TIME: '2011-02-02 12:00:00', BOM_PRES: '929' })
        )
      )
    );
    expect(storms[0].points.map((p: { pressure: number }) => p.pressure)).toEqual([990, 929, 940]);
  });

  it('takes the minimum pressure as the storm intensity', () => {
    const storms = parse.buildStorms(
      parse.parseIbtracsCsv(csv(row({ BOM_PRES: '990' }), row({ ISO_TIME: '2011-02-03 00:00:00', BOM_PRES: '929' })))
    );
    expect(storms[0].minPressure).toBe(929);
    expect(storms[0].isSevere).toBe(true);
  });

  it('classes a storm as tropical if ANY fix is tropical', () => {
    // NR ("not reported") dominates the pre-satellite record, so requiring every fix to be TS
    // would silently delete the early decades.
    const storms = parse.buildStorms(
      parse.parseIbtracsCsv(csv(row({ NATURE: 'NR' }), row({ ISO_TIME: '2011-02-03 00:00:00', NATURE: 'TS' })))
    );
    expect(storms[0].isTropicalCyclone).toBe(true);
  });

  it('does not treat a system that was never tropical as a cyclone', () => {
    const storms = parse.buildStorms(parse.parseIbtracsCsv(csv(row({ NATURE: 'NR' }))));
    expect(storms[0].isTropicalCyclone).toBe(false);
  });

  it('records a coast crossing from a zero landfall distance', () => {
    const storms = parse.buildStorms(parse.parseIbtracsCsv(csv(row({ LANDFALL: '0' }))));
    expect(storms[0].crossedCoast).toBe(true);
    expect(storms[0].landfallLat).toBe(-17.5);
  });

  it('does not invent a crossing from a non-zero distance', () => {
    const storms = parse.buildStorms(parse.parseIbtracsCsv(csv(row({ LANDFALL: '140' }))));
    expect(storms[0].crossedCoast).toBe(false);
    expect(storms[0].landfallLat).toBeNull();
  });

  it('reports which measures exist so the UI can say "not recorded"', () => {
    const storms = parse.buildStorms(
      parse.parseIbtracsCsv(csv(row({ BOM_WIND: '', WMO_WIND: '', BOM_GUST: '', BOM_R34_NE: '' })))
    );
    expect(storms[0].basis).toEqual({ pressure: true, wind: false, gust: false, radii: true });
  });
});

describe('season aggregation', () => {
  const storms = parse.buildStorms(
    parse.parseIbtracsCsv(
      csv(
        row({ SID: 'a', SEASON: '2011', BOM_PRES: '929' }),
        row({ SID: 'b', SEASON: '2011', BOM_PRES: '985', LANDFALL: '200' }),
        row({ SID: 'c', SEASON: '2012', BOM_PRES: '', WMO_PRES: '' })
      )
    )
  );

  it('counts only tropical cyclones', () => {
    const rows = parse.seasonSummary(storms);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ season: 2011, label: '2010-11', count: 2, severeCount: 1 });
  });

  it('separates "measured" from "counted"', () => {
    // A season of storms nobody measured is not a calm season.
    const rows = parse.seasonSummary(storms);
    expect(rows[1]).toMatchObject({ season: 2012, count: 1, withPressure: 0, severeCount: 0, deepest: null });
  });

  it('never reports more severe storms than measured ones', () => {
    for (const row2 of parse.seasonSummary(storms)) {
      expect(row2.severeCount).toBeLessThanOrEqual(row2.withPressure);
    }
  });
});

describe('linear trend', () => {
  it('recovers a known slope', () => {
    const t = parse.linearTrend([0, 1, 2, 3], [0, 2, 4, 6]);
    expect(t.slope).toBeCloseTo(2, 10);
    expect(t.perDecade).toBeCloseTo(20, 10);
  });

  it('returns null rather than dividing by zero on a flat x axis', () => {
    expect(parse.linearTrend([5, 5, 5], [1, 2, 3])).toBeNull();
    expect(parse.linearTrend([1], [1])).toBeNull();
  });
});

describe('quoted CSV fields', () => {
  it('does not split on a comma inside quotes', () => {
    expect(parse.splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('handles a doubled quote', () => {
    expect(parse.splitCsvLine('a,"say ""hi""",b')).toEqual(['a', 'say "hi"', 'b']);
  });

  it('preserves empty trailing fields', () => {
    expect(parse.splitCsvLine('a,,')).toEqual(['a', '', '']);
  });
});
