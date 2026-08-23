// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later

export type PressureClassId = 'extreme' | 'severe' | 'strong' | 'moderate' | 'weak';

export interface Storm {
  sid: string;
  name: string | null;
  season: number | null;
  seasonLabel: string | null;
  minPressure: number | null;
  maxWind: number | null;
  maxGust: number | null;
  cls: PressureClassId | null;
  severe: boolean;
  tropical: boolean;
  crossed: boolean;
  state: string | null;
  stateName: string | null;
  lfLat: number | null;
  lfLon: number | null;
  genLat: number | null;
  genLon: number | null;
  points: number;
  hours: number;
  start: number | null;
  end: number | null;
  /** True for seasons IBTrACS has positions for but has not yet analysed for intensity. */
  provisional: boolean;
  basis: { pressure: boolean; wind: boolean; gust: boolean; radii: boolean };
  /** Largest mean gale-force (34 kt) radius reached, nautical miles. */
  galeRadius: number | null;
}

/** Flat [lat0, lon0, lat1, lon1, ...] — see the note in pipeline/aggregate.mjs. */
export type Track = number[];

export interface Profile {
  /** Minutes since this storm's own first fix. */
  t: (number | null)[];
  p: (number | null)[];
  w: (number | null)[];
  n: (string | null)[];
  r: (number | null)[];
}

export interface SeasonRow {
  season: number;
  label: string;
  count: number;
  severeCount: number;
  crossings: number;
  withPressure: number;
  deepest: number | null;
  trackDays: number;
}

export interface StateRow {
  code: string;
  name: string;
  crossings: number;
  severeCrossings: number;
  deepest: number | null;
  deepestStorm: string | null;
  firstSeason: number | null;
  lastSeason: number | null;
}

export interface DecadeRow {
  decade: number;
  label: string;
  storms: number;
  pressure: number;
  wind: number;
  gust: number;
  radii: number;
}

export interface SeverityTwoWays {
  decade: number;
  label: string;
  byGust: number;
  byPressure: number;
  storms: number;
}

export interface IntensificationRow {
  sid: string;
  name: string | null;
  season: number | null;
  seasonLabel: string | null;
  drop: number;
  hours: number;
  minPressure: number | null;
}

export interface EraRow {
  from: number;
  to: number;
  label: string;
  seasons: number;
  storms: number;
  perSeason: number;
  measured: number;
  coverage: number;
  severe: number;
  severePerSeason: number;
  severeShareOfMeasured: number;
  medianMinPressure: number | null;
}

export interface Meta {
  generated: string;
  completeThroughSeason: number;
  completeThroughLabel: string;
  provisionalSeasons: number[];
  satelliteEraStart: number;
  severeHpa: number;
  pressureClasses: { id: PressureClassId; label: string; max: number | null }[];
  counts: {
    systems: number;
    tropical: number;
    named: number;
    distinctNames: number;
    points: number;
    crossings: number;
    seasons: number;
    withRadii: number;
  };
  firstSeasonLabel: string;
  trend: { from: number; to: number; countPerDecade: number; severePerDecade: number };
  eras: EraRow[];
  source: {
    ibtracs: {
      publisher: string;
      product: string;
      licence: string;
      citation: string;
      paper: string;
      originatingAgency: string;
      homepage: string;
    };
    boundaries: { publisher: string; product: string; licence: string };
  };
  gates: { name: string; pass: boolean; detail: string; advisory: boolean }[];
}

export interface SeasonsPayload {
  seasons: SeasonRow[];
  byState: StateRow[];
  decades: DecadeRow[];
  severityTwoWays: SeverityTwoWays[];
  intensification: IntensificationRow[];
}
