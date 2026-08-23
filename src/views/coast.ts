// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Coast — where cyclones actually reach land, and where they are born.
// Question it answers: how exposed is my stretch of coast, and which storms hit it?

import { createTrackMap, type TrackMapHandle } from '../components/trackMap';
import { barRow, callout, el, panel, sortableTable, statRow } from '../components/ui';
import { CLASS_COLOUR, ACCENT } from '../palette';
import { term } from '../glossary';
import { esc, num, pressure } from '../format';
import type { ViewContext } from './atlas';
import type { StateRow, Storm } from '../types';

let handle: TrackMapHandle | null = null;

export function destroyCoast(): void {
  handle?.destroy();
  handle = null;
}

export function renderCoast(host: HTMLElement, ctx: ViewContext): void {
  const { meta, seasons, storms } = ctx.bundle;
  const byState = seasons.byState;
  const crossings = storms.filter((s) => s.crossed);
  const located = crossings.filter((s) => s.state);

  const intro = el('div', 'view-intro');
  intro.append(el('h1', 'view-title', 'Where they cross the coast'));
  const lede = el('p', 'view-lede');
  lede.innerHTML = `${num(crossings.length)} of ${num(meta.counts.systems)} tracked systems have made a ${term('landfall', 'coast crossing')}. Crossings are placed by matching the crossing position against real state and territory boundaries, so the ranking below is geography, not guesswork.`;
  intro.append(lede);
  host.append(intro);

  const topState = byState[0];
  host.append(
    statRow([
      { value: num(crossings.length), label: 'coast crossings on record', tip: 'Systems whose centre passed from sea to land at least once.' },
      { value: topState ? esc(topState.name) : '—', label: 'most-crossed jurisdiction', tip: topState ? `${topState.crossings} crossings on record.` : '' },
      { value: topState ? num(topState.crossings) : '—', label: `crossings, ${topState ? esc(topState.name) : ''}` },
      {
        value: `${Math.round((100 * located.length) / Math.max(1, crossings.length))}%`,
        label: 'crossings located',
        tip: 'The remainder crossed a coast outside Australia — Indonesia, Papua New Guinea or an island territory — or too far offshore to place.',
      },
    ])
  );

  // --- Leaderboard ---------------------------------------------------------------------
  const rank = panel(
    'Coast crossings by jurisdiction',
    'Ranked by total recorded crossings. Click a bar to see every storm behind it.'
  );
  const max = Math.max(...byState.map((s) => s.crossings), 1);
  for (const state of byState) {
    rank.append(
      barRow(
        state.name,
        state.crossings,
        max,
        num(state.crossings),
        ACCENT,
        `${state.name}\n${state.crossings} coast crossings\n${state.severeCrossings} of them severe\nDeepest: ${state.deepestStorm ?? 'unknown'} at ${pressure(state.deepest)}\nRecorded ${state.firstSeason ? state.firstSeason - 1 : '?'} to ${state.lastSeason ? state.lastSeason - 1 : '?'}`,
        () => showState(state)
      )
    );
  }
  rank.append(
    el(
      'p',
      'panel-note',
      'A crossing is counted where the archive records the storm centre over land at its next fix. A cyclone can cause severe damage — flooding, storm surge, destructive wind — without its centre ever crossing, so this is a measure of direct hits, not of harm.'
    )
  );
  host.append(rank);

  // --- Severity split -------------------------------------------------------------------
  const severity = panel(
    'How many crossings were severe',
    `Severe means the storm reached ${meta.severeHpa} hPa or lower at some point in its life — not necessarily at the moment it crossed.`
  );
  severity.append(
    sortableTable<StateRow>(
      byState,
      [
        { key: 'name', label: 'Jurisdiction', value: (r) => r.name, sort: (a, b) => a.name.localeCompare(b.name) },
        { key: 'crossings', label: 'Crossings', numeric: true, value: (r) => r.crossings },
        { key: 'severe', label: 'Severe', numeric: true, value: (r) => r.severeCrossings },
        {
          key: 'share',
          label: 'Severe share',
          numeric: true,
          value: (r) => (r.crossings ? Math.round((100 * r.severeCrossings) / r.crossings) : null),
          render: (r) => (r.crossings ? `${Math.round((100 * r.severeCrossings) / r.crossings)}%` : '—'),
        },
        {
          key: 'deepest',
          label: 'Deepest to cross',
          numeric: true,
          value: (r) => r.deepest,
          render: (r) => (r.deepest === null ? 'Not recorded' : `${r.deepestStorm ?? 'Unnamed'} — ${r.deepest} hPa`),
          sort: (a, b) => (b.deepest ?? Infinity) - (a.deepest ?? Infinity),
        },
      ],
      { initialSort: 'crossings', descending: true, onRow: (row) => showState(row) }
    )
  );
  host.append(severity);

  // --- Genesis vs landfall map ----------------------------------------------------------
  const mapPanel = panel(
    'Born here, landed there',
    'Switch between where storms formed and where they reached land. The two geographies are different: genesis clusters in reliably warm water and barely moves from decade to decade, while crossings are scattered along the whole northern coast.'
  );
  const modeBar = el('div', 'filter-bar');
  const group = el('div', 'toggle-group');
  const mapFrame = el('div', 'map-frame');
  let mode: 'genesis' | 'landfall' = 'landfall';

  const build = () => {
    handle?.destroy();
    handle = createTrackMap({
      container: mapFrame,
      tracks: ctx.bundle.tracks,
      boundaries: ctx.bundle.boundaries,
      onSelect: ctx.openStorm,
      mode,
    });
    handle.setStorms(mode === 'genesis' ? storms : crossings);
  };

  for (const [label, value] of [
    ['Coast crossings', 'landfall'],
    ['Formation points', 'genesis'],
  ] as [string, 'genesis' | 'landfall'][]) {
    const button = el('button', undefined, label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(mode === value));
    button.setAttribute(
      'data-tip',
      value === 'genesis'
        ? 'Where each system was first tracked.'
        : 'Where each system\'s centre first reached land.'
    );
    button.addEventListener('click', () => {
      mode = value;
      for (const sibling of group.querySelectorAll('button')) {
        sibling.setAttribute('aria-pressed', String((sibling.textContent === 'Formation points') === (mode === 'genesis')));
      }
      build();
    });
    group.append(button);
  }
  const field = el('div', 'field');
  field.append(el('label', 'field-label', 'Show'), group);
  modeBar.append(field);
  mapPanel.append(modeBar, mapFrame);
  const hint = el('p', 'map-hint');
  hint.textContent = 'Each dot is one storm. Larger dots are severe storms. Hover for the name, click for the full record.';
  mapPanel.append(hint);
  host.append(mapPanel);
  build();

  host.append(
    callout(
      `Roughly ${Math.round((100 * crossings.length) / meta.counts.systems)}% of tracked systems ever
       reach land. Most spend their whole life at sea — which is why a cyclone season with a high
       storm count is not automatically a bad season for anyone on shore, and why the crossing
       counts above matter more to a resident than the totals on the Seasons view.`
    )
  );

  // --- The drill-down: every storm behind one jurisdiction --------------------------------
  function showState(state: StateRow): void {
    const list = crossings
      .filter((s) => s.state === state.code)
      .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));

    const existing = host.querySelector('#coast-drill');
    existing?.remove();

    const drill = panel(
      `${state.name}: ${num(list.length)} recorded crossings`,
      'Every system whose centre reached land here, most recent first. Click any storm for its full record.'
    );
    drill.id = 'coast-drill';
    drill.append(
      sortableTable<Storm>(
        list,
        [
          {
            key: 'season',
            label: 'Season',
            value: (s) => s.season,
            render: (s) => s.seasonLabel ?? '—',
          },
          {
            key: 'name',
            label: 'Storm',
            value: (s) => s.name ?? 'Unnamed',
            render: (s) => {
              const button = el('button', 'row-button', esc(s.name ?? 'Unnamed system'));
              button.type = 'button';
              button.addEventListener('click', () => ctx.openStorm(s.sid));
              return button;
            },
          },
          {
            key: 'pressure',
            label: 'Lowest pressure',
            numeric: true,
            value: (s) => s.minPressure,
            render: (s) => (s.minPressure === null ? 'Not recorded' : `${s.minPressure} hPa`),
            sort: (a, b) => (b.minPressure ?? Infinity) - (a.minPressure ?? Infinity),
          },
          {
            key: 'severe',
            label: 'Severe',
            value: (s) => (s.severe ? 1 : 0),
            render: (s) => {
              if (!s.severe) return '—';
              const pill = el('span', 'pill');
              pill.style.background = CLASS_COLOUR.severe;
              pill.textContent = 'Severe';
              return pill;
            },
          },
        ],
        { initialSort: 'season', descending: true, onRow: (s) => ctx.openStorm(s.sid) }
      )
    );
    host.append(drill);
    drill.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
