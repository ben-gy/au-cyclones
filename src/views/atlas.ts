// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Atlas — every tracked system as a real polyline, filterable.
// Question it answers: has one come past HERE, and which one was it?

import { createTrackMap, type TrackMapHandle } from '../components/trackMap';
import { el, panel, severityLegend, statRow } from '../components/ui';
import { term } from '../glossary';
import { num } from '../format';
import type { Bundle } from '../data';
import type { PressureClassId, Storm } from '../types';

export interface ViewContext {
  bundle: Bundle;
  openStorm: (sid: string) => void;
  goTo: (view: string) => void;
}

let handle: TrackMapHandle | null = null;

export function destroyAtlas(): void {
  handle?.destroy();
  handle = null;
}

export function renderAtlas(host: HTMLElement, ctx: ViewContext): void {
  const { bundle } = ctx;
  const { meta, storms } = bundle;

  const active = new Set<PressureClassId | 'none'>([
    'extreme',
    'severe',
    'strong',
    'moderate',
    'weak',
    'none',
  ]);
  // The map opens on the satellite era rather than on all 120 years. Drawing every system at
  // once produces an unreadable scribble in which no individual track can be seen or clicked,
  // and the earliest decades are the ones that are least trustworthy anyway. The season
  // selector goes back to the start of the record for anyone who wants it.
  const filters = {
    from: meta.satelliteEraStart,
    to: meta.completeThroughSeason + 1,
    crossedOnly: false,
    namedOnly: false,
  };

  const intro = el('div', 'view-intro');
  intro.append(el('h1', 'view-title', 'Every cyclone track'));
  const lede = el('p', 'view-lede');
  lede.innerHTML = `Every system tracked in the ${term('australian region')} — ${num(meta.counts.systems)} of them, back to ${meta.firstSeasonLabel}. Colour shows the lowest ${term('central pressure')} the storm reached, so darker is stronger. Click any track to open it.`;
  intro.append(lede);
  const opening = el('p', 'view-lede');
  opening.innerHTML = `The map opens on the ${term('satellite era')}, from ${meta.satelliteEraStart - 1}-${String(meta.satelliteEraStart % 100).padStart(2, '0')}, because drawing all ${num(meta.counts.systems)} at once is an unreadable tangle and the earliest decades are the least complete. Widen the seasons below to see the whole record.`;
  intro.append(opening);
  host.append(intro);

  const stats = statRow([
    { value: num(meta.counts.systems), label: 'systems tracked', tip: 'Every system the archive tracked inside 90°E–160°E, south of the equator.' },
    { value: num(meta.counts.tropical), label: 'reached cyclone strength', tip: 'Systems that reached tropical-cyclone classification at some point in their life.' },
    { value: num(meta.counts.crossings), label: 'crossed the coast', tip: 'Systems whose centre passed from sea to land at least once.' },
    { value: num(meta.counts.distinctNames), label: 'named storms', tip: 'Distinct storm names in the record. Names are reused across decades, and retired after the worst storms.' },
  ]);
  host.append(stats);

  const controls = panel('Filter the map');
  const bar = el('div', 'filter-bar');

  const makeSeasonField = (label: string, key: 'from' | 'to') => {
    const field = el('div', 'field');
    field.append(el('label', 'field-label', label));
    const select = el('select');
    for (let s = 1907; s <= meta.completeThroughSeason + 1; s += 1) {
      const option = el('option');
      option.value = String(s);
      option.textContent = `${s - 1}-${String(s % 100).padStart(2, '0')}`;
      if (s === filters[key]) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => {
      filters[key] = Number(select.value);
      apply();
    });
    field.append(select);
    return field;
  };
  bar.append(makeSeasonField('From season', 'from'), makeSeasonField('To season', 'to'));

  const toggleField = (label: string, key: 'crossedOnly' | 'namedOnly', tipText: string) => {
    const field = el('div', 'field');
    field.append(el('label', 'field-label', label));
    const group = el('div', 'toggle-group');
    for (const [text, value] of [['All', false], ['Only these', true]] as [string, boolean][]) {
      const button = el('button', undefined, text);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(filters[key] === value));
      button.setAttribute('data-tip', tipText);
      button.addEventListener('click', () => {
        filters[key] = value;
        for (const sibling of group.querySelectorAll('button')) {
          sibling.setAttribute('aria-pressed', String((sibling.textContent === 'Only these') === filters[key]));
        }
        apply();
      });
      group.append(button);
    }
    field.append(group);
    return field;
  };
  bar.append(
    toggleField('Coast crossings', 'crossedOnly', 'Show only storms whose centre reached land.'),
    toggleField('Named storms', 'namedOnly', 'Show only storms that were given a name. Older and weaker systems often were not.')
  );
  controls.append(bar);

  const legend = severityLegend(meta, {
    active,
    onToggle: (id) => {
      if (active.has(id)) active.delete(id);
      else active.add(id);
      for (const button of legend.querySelectorAll<HTMLButtonElement>('.legend-button')) {
        const label = button.textContent ?? '';
        const match = meta.pressureClasses.find((c) => label.includes(c.label));
        const key: PressureClassId | 'none' = match ? match.id : 'none';
        button.setAttribute('aria-pressed', String(active.has(key)));
      }
      apply();
    },
  });
  controls.append(legend);

  const count = el('p', 'panel-note');
  controls.append(count);
  host.append(controls);

  const mapPanel = el('div', 'panel');
  const mapFrame = el('div', 'map-frame');
  mapPanel.append(mapFrame);
  const hint = el('p', 'map-hint');
  hint.innerHTML =
    'Hover a track for its summary, click for the full record. Use the + and − buttons to zoom — the map deliberately does not capture your scroll. Grey tracks are seasons the archive has ' +
    term('provisional', 'not yet analysed') +
    '.';
  mapPanel.append(hint);
  host.append(mapPanel);

  handle = createTrackMap({
    container: mapFrame,
    tracks: bundle.tracks,
    boundaries: bundle.boundaries,
    onSelect: ctx.openStorm,
  });

  function matches(storm: Storm): boolean {
    const season = storm.season ?? 0;
    if (season < filters.from || season > filters.to) return false;
    if (filters.crossedOnly && !storm.crossed) return false;
    if (filters.namedOnly && !storm.name) return false;
    const key: PressureClassId | 'none' = storm.cls ?? 'none';
    return active.has(key);
  }

  function apply(): void {
    const visible = storms.filter(matches);
    handle?.setStorms(visible);
    count.textContent = `Showing ${num(visible.length)} of ${num(storms.length)} systems.`;
  }

  apply();
}

/** Focus a storm on the currently mounted atlas map, if it is mounted. */
export function focusOnMap(sid: string): void {
  handle?.focus(sid);
}
