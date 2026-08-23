// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Hash routing. Nav labels are WORDS ONLY — never a count badge; counts belong inside the
// views, where they can be explained.

export interface ViewDef {
  id: string;
  label: string;
  /** Used for the document title and as the tab's tooltip. */
  blurb: string;
}

export const VIEWS: ViewDef[] = [
  { id: 'atlas', label: 'Atlas', blurb: 'Every tracked cyclone on one map' },
  { id: 'seasons', label: 'Seasons', blurb: 'How many cyclones each season, and how strong' },
  { id: 'coast', label: 'Coast', blurb: 'Where cyclones cross the coast, ranked' },
  { id: 'records', label: 'Records', blurb: 'Deepest, longest, fastest-strengthening' },
  { id: 'anatomy', label: 'Anatomy', blurb: 'Storm size against storm strength' },
  { id: 'record', label: 'The record', blurb: 'What was measured, and which charts lie' },
];

export interface Route {
  view: string;
  storm: string | null;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [viewPart, ...rest] = raw.split('&');
  const view = VIEWS.some((v) => v.id === viewPart) ? viewPart : VIEWS[0].id;
  const params = new URLSearchParams(rest.join('&'));
  return { view, storm: params.get('storm') };
}

export function buildHash(route: Route): string {
  return route.storm ? `#${route.view}&storm=${encodeURIComponent(route.storm)}` : `#${route.view}`;
}
