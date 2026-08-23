// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Coast-crossing placement, tested against the REAL shipped boundary file rather than a
// synthetic square. A locator that works on a unit square and fails on Australia is exactly
// the defect this file exists to catch.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — dependency-free .mjs shared with the pipeline
import { buildStateLocator, haversineKm, _test } from '../pipeline/geo.mjs';

const ROOT = join(import.meta.dirname, '..');
const GEO = JSON.parse(readFileSync(join(ROOT, 'public/data/au-states.geojson'), 'utf8'));
const locate = buildStateLocator(GEO);

describe('the boundary file is real geometry', () => {
  it('is far too large to have been hand-authored', () => {
    // A boundary file under 50 KB is an automatic fail — that is how rectangles for the
    // Northern Territory once shipped as a "map" elsewhere in this fleet.
    expect(statSync(join(ROOT, 'public/data/au-states.geojson')).size).toBeGreaterThan(50_000);
  });

  it('has states with realistic vertex counts', () => {
    for (const feature of GEO.features) {
      const rings =
        feature.geometry.type === 'Polygon'
          ? feature.geometry.coordinates
          : feature.geometry.coordinates.flat();
      const vertices = rings.reduce((sum: number, ring: number[][]) => sum + ring.length, 0);
      expect(vertices, `${feature.properties.name} looks like a rectangle`).toBeGreaterThan(50);
    }
  });
});

describe('point in polygon', () => {
  const square = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ];

  it('accepts an interior point and rejects an exterior one', () => {
    expect(_test.pointInPolygon(5, 5, square)).toBe(true);
    expect(_test.pointInPolygon(15, 5, square)).toBe(false);
    expect(_test.pointInPolygon(5, 15, square)).toBe(false);
  });

  it('respects a hole', () => {
    const withHole = [
      ...square,
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ];
    expect(_test.pointInPolygon(5, 5, withHole)).toBe(false);
    expect(_test.pointInPolygon(2, 2, withHole)).toBe(true);
  });
});

describe('distance is spherical, not squared degrees', () => {
  it('measures a known separation to within a per cent', () => {
    // Sydney to Melbourne is about 714 km.
    const d = haversineKm(-33.87, 151.21, -37.81, 144.96);
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(730);
  });

  it('is symmetric and zero for identical points', () => {
    expect(haversineKm(-20, 130, -20, 130)).toBe(0);
    expect(haversineKm(-20, 130, -25, 135)).toBeCloseTo(haversineKm(-25, 135, -20, 130), 9);
  });

  it('does not treat a degree of longitude as constant', () => {
    // A degree of longitude is ~111 km at the equator and ~78 km at 45S. A squared-degree
    // metric would call these equal and hand high-latitude crossings to the wrong state.
    const equatorial = haversineKm(-1, 130, -1, 131);
    const southern = haversineKm(-45, 130, -45, 131);
    expect(equatorial).toBeGreaterThan(southern * 1.3);
  });
});

describe('placing real coast crossings', () => {
  const cases: [string, number, number, string][] = [
    ['Cairns, far north Queensland', -16.9, 145.8, 'Queensland'],
    ['Darwin, Top End', -12.45, 130.85, 'Northern Territory'],
    ['Port Hedland, Pilbara', -20.3, 118.6, 'Western Australia'],
    ['Broome, Kimberley', -17.95, 122.24, 'Western Australia'],
    ['Brisbane, south-east Queensland', -27.47, 153.03, 'Queensland'],
  ];

  for (const [label, lat, lon, expected] of cases) {
    it(`places ${label} in ${expected}`, () => {
      expect(locate(lat, lon)?.name).toBe(expected);
    });
  }

  it('places a just-offshore crossing on the nearest coast', () => {
    // Landfall points are recorded where the NEXT fix is over land, so most sit offshore.
    // Containment alone would return null for the majority of real crossings.
    const offshore = locate(-16.6, 146.4);
    expect(offshore?.name).toBe('Queensland');
    expect(offshore?.distanceKm).toBeGreaterThan(0);
  });

  it('refuses to place a mid-ocean point in Australia', () => {
    // Without a distance ceiling, every Indian Ocean storm would be assigned to Western
    // Australia and the coast leaderboard would be fiction.
    expect(locate(-20, 95)).toBeNull(); // ~1,400 km west of the Pilbara
    expect(locate(-25, 170)).toBeNull(); // Coral Sea, well east of Queensland
  });

  it('still places a point that is genuinely just off the coast', () => {
    // The ceiling must not be so tight that it discards real crossings. A fix 165 km off
    // Coffs Harbour is within one time step of land and belongs to New South Wales.
    expect(locate(-30, 155)?.name).toBe('New South Wales');
  });

  it('honours an explicit distance ceiling', () => {
    expect(locate(-16.0, 147.4, 10)).toBeNull();
    expect(locate(-16.0, 147.4, 400)?.name).toBe('Queensland');
  });
});

describe('the shipped crossing table', () => {
  const seasons = JSON.parse(readFileSync(join(ROOT, 'public/data/seasons.json'), 'utf8'));
  const storms = JSON.parse(readFileSync(join(ROOT, 'public/data/storms.json'), 'utf8'));

  it('is dominated by the cyclone-exposed north, which is the sanity check that matters', () => {
    const names = seasons.byState.map((s: { name: string }) => s.name);
    expect(names.slice(0, 3)).toEqual(
      expect.arrayContaining(['Queensland', 'Western Australia', 'Northern Territory'])
    );
  });

  it('reconciles against the storm index', () => {
    const tableTotal = seasons.byState.reduce((sum: number, s: { crossings: number }) => sum + s.crossings, 0);
    const located = storms.filter((s: { crossed: boolean; state: string | null }) => s.crossed && s.state).length;
    expect(tableTotal).toBe(located);
  });

  it('never reports more severe crossings than crossings', () => {
    for (const state of seasons.byState) {
      expect(state.severeCrossings).toBeLessThanOrEqual(state.crossings);
    }
  });
});
