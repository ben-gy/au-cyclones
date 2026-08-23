// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Loading. Geometry and intensity are two separate payloads: the map needs coordinates on
// arrival, and pressure/wind/timing are only read inside a storm dossier, so they are fetched
// on the first drill-down instead of on every page load.

import type { Meta, Profile, SeasonsPayload, Storm, Track } from './types';

export interface Bundle {
  meta: Meta;
  storms: Storm[];
  tracks: Record<string, Track>;
  seasons: SeasonsPayload;
  boundaries: unknown;
  byId: Map<string, Storm>;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function loadBundle(signal?: AbortSignal): Promise<Bundle> {
  const [meta, storms, tracks, seasons, boundaries] = await Promise.all([
    getJson<Meta>('data/meta.json', signal),
    getJson<Storm[]>('data/storms.json', signal),
    getJson<Record<string, Track>>('data/tracks.json', signal),
    getJson<SeasonsPayload>('data/seasons.json', signal),
    getJson<unknown>('data/au-states.geojson', signal),
  ]);
  return { meta, storms, tracks, seasons, boundaries, byId: new Map(storms.map((s) => [s.sid, s])) };
}

let profilePromise: Promise<Record<string, Profile>> | null = null;

/** Fetched once, on the first dossier open, and shared by every later one. */
export function loadProfiles(): Promise<Record<string, Profile>> {
  profilePromise ??= getJson<Record<string, Profile>>('data/profiles.json');
  return profilePromise;
}

/** Coordinates are stored flat as [lat0, lon0, lat1, lon1, ...] to save ~400 KB of JSON
 *  punctuation across 97,000 points. Rehydrate to Leaflet's [lat, lon] pairs. */
export function toLatLngs(track: Track | undefined): [number, number][] {
  if (!track) return [];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < track.length; i += 2) out.push([track[i], track[i + 1]]);
  return out;
}

/**
 * Case- and accent-insensitive name search over named storms.
 * Returns storms whose name starts with the query first, then those merely containing it, so
 * typing "al" surfaces Alfred and Alby before Kimberley.
 */
export function searchStorms(storms: Storm[], query: string, limit = 12): Storm[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: Storm[] = [];
  const contains: Storm[] = [];
  for (const storm of storms) {
    if (!storm.name) continue;
    const name = storm.name.toLowerCase();
    if (name.startsWith(q)) starts.push(storm);
    else if (name.includes(q)) contains.push(storm);
  }
  const rank = (a: Storm, b: Storm) => (b.season ?? 0) - (a.season ?? 0);
  return [...starts.sort(rank), ...contains.sort(rank)].slice(0, limit);
}
