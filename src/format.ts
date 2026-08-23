// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Formatting. Every function here treats null as "not recorded" and says so, rather than
// rendering 0, '-', or the string 'null'. On this site the difference between "no cyclone"
// and "nobody measured" is the whole point.

/** Knots to km/h. IBTrACS normalises every agency's wind to knots; Australians read km/h. */
export const KT_TO_KMH = 1.852;
/** Nautical miles to km, for the gale-radius fields. */
export const NM_TO_KM = 1.852;

export const NOT_RECORDED = 'Not recorded';

export function num(value: number | null | undefined, dp = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_RECORDED;
  return value.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pressure(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_RECORDED;
  return `${num(value)} hPa`;
}

/** Wind in km/h, converted from knots. Both are shown because cyclone warnings quote km/h
 *  and the archive stores knots, and a reader comparing the two needs to see the bridge. */
export function windKmh(knots: number | null | undefined): string {
  if (knots === null || knots === undefined) return NOT_RECORDED;
  return `${num(Math.round(knots * KT_TO_KMH))} km/h`;
}

export function radiusKm(nauticalMiles: number | null | undefined): string {
  if (nauticalMiles === null || nauticalMiles === undefined) return NOT_RECORDED;
  return `${num(Math.round(nauticalMiles * NM_TO_KM))} km`;
}

/** A duration in hours as something a person would say. */
export function duration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || hours <= 0) return NOT_RECORDED;
  if (hours < 48) return `${num(hours)} hours`;
  const days = hours / 24;
  return `${num(days, days < 10 ? 1 : 0)} days`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Absolute date in UTC. Best-track times are UTC and converting them to the reader's local
 *  zone would silently move a landfall across midnight. */
export function dateUtc(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return NOT_RECORDED;
  const d = new Date(epochMs);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function latLon(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null) return NOT_RECORDED;
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'W' : 'E';
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lon).toFixed(1)}°${ew}`;
}

export function stormTitle(name: string | null, seasonLabel: string | null): string {
  const label = seasonLabel ? ` (${seasonLabel})` : '';
  return name ? `Cyclone ${name}${label}` : `Unnamed system${label}`;
}

/**
 * Escape for insertion into an HTML attribute via innerHTML — including newlines, which must
 * become the numeric entity or the attribute is truncated at the line break.
 *
 * There are two escaping needs on this site and they are NOT interchangeable:
 * this one, for markup built as a string, and `setAttribute`, which takes raw text and must
 * NOT be handed entities or the reader sees a literal '&#10;'. Using the wrong one is silent.
 */
export function attr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

/** Escape for text content built into an HTML string. */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
