// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Records — the extremes, and the storms that broke the pattern.
// Question it answers: what are the biggest ones, and is anything anomalous?

import { barRow, callout, el, panel, sortableTable } from '../components/ui';
import { histogram } from '../charts';
import { classColour, ACCENT, CLASS_COLOUR, WARN } from '../palette';
import { term } from '../glossary';
import { duration, esc, num, pressure, radiusKm, windKmh } from '../format';
import type { ViewContext } from './atlas';
import type { IntensificationRow, Storm } from '../types';

export function renderRecords(host: HTMLElement, ctx: ViewContext): void {
  const { meta, seasons, storms } = ctx.bundle;
  const named = storms.filter((s) => !s.provisional);

  const intro = el('div', 'view-intro');
  intro.append(el('h1', 'view-title', 'Records'));
  const lede = el('p', 'view-lede');
  lede.innerHTML = `The extremes of the Australian record. Every figure here is computed from the archive rather than quoted, and every "not recorded" is a storm nobody measured — ${term('unmeasured', 'not a weak one')}.`;
  intro.append(lede);
  host.append(intro);

  // --- Deepest -------------------------------------------------------------------------
  const deepest = named
    .filter((s) => s.minPressure !== null)
    .sort((a, b) => (a.minPressure ?? 0) - (b.minPressure ?? 0))
    .slice(0, 15);
  const deepPanel = panel(
    'Deepest cyclones on record',
    `Lowest ${'central pressure'} reached. Lower is stronger — an ordinary day is about 1013 hPa.`
  );
  const deepMin = Math.min(...deepest.map((s) => s.minPressure ?? 1000));
  const deepMax = Math.max(...deepest.map((s) => s.minPressure ?? 1000));
  for (const storm of deepest) {
    // Bar length is inverted depth: the deeper the storm, the longer the bar.
    const depth = deepMax - (storm.minPressure ?? deepMax) + 4;
    deepPanel.append(
      barRow(
        `${storm.name ?? 'Unnamed'} · ${storm.seasonLabel ?? ''}`,
        depth,
        deepMax - deepMin + 4,
        pressure(storm.minPressure),
        classColour(storm.cls),
        `${storm.name ?? 'Unnamed system'} (${storm.seasonLabel})\nLowest pressure ${pressure(storm.minPressure)}\nStrongest wind ${windKmh(storm.maxWind)}\n${storm.crossed ? `Crossed the coast — ${storm.stateName ?? 'location unresolved'}` : 'Never crossed the coast'}`,
        () => ctx.openStorm(storm.sid)
      )
    );
  }
  const crossedCount = deepest.filter((s) => s.crossed).length;
  deepPanel.append(
    callout(
      `The deepest storm in the record is ${esc(deepest[0]?.name ?? 'unnamed')}
       (${esc(deepest[0]?.seasonLabel ?? '')}) at ${pressure(deepest[0]?.minPressure ?? null)}, and
       ${crossedCount} of these ${deepest.length} reached land at some point.
       <strong>That is not the same as arriving at full strength.</strong> The pressure shown is the
       lowest the storm reached anywhere in its life, which is not necessarily where or when it
       crossed the coast — so this is a ranking of peak intensity, not of damage done. The storms
       people remember are often not the ones at the top of this list.`
    )
  );
  host.append(deepPanel);

  // --- Longest lived --------------------------------------------------------------------
  const longest = [...named].sort((a, b) => b.hours - a.hours).slice(0, 12);
  const longPanel = panel('Longest-lived systems', 'Total time from first tracked position to last.');
  const longMax = longest[0]?.hours ?? 1;
  for (const storm of longest) {
    longPanel.append(
      barRow(
        `${storm.name ?? 'Unnamed'} · ${storm.seasonLabel ?? ''}`,
        storm.hours,
        longMax,
        duration(storm.hours),
        ACCENT,
        `${storm.name ?? 'Unnamed system'} (${storm.seasonLabel})\nTracked for ${duration(storm.hours)}\n${num(storm.points)} recorded positions\nLowest pressure ${pressure(storm.minPressure)}`,
        () => ctx.openStorm(storm.sid)
      )
    );
  }
  host.append(longPanel);

  // --- Biggest --------------------------------------------------------------------------
  const widest = named
    .filter((s) => s.galeRadius !== null)
    .sort((a, b) => (b.galeRadius ?? 0) - (a.galeRadius ?? 0))
    .slice(0, 12);
  if (widest.length) {
    const widePanel = panel(
      'Widest storms',
      `How far ${'gale-force winds'} reached from the centre — the storm's size rather than its strength.`
    );
    const wideMax = widest[0]?.galeRadius ?? 1;
    for (const storm of widest) {
      widePanel.append(
        barRow(
          `${storm.name ?? 'Unnamed'} · ${storm.seasonLabel ?? ''}`,
          storm.galeRadius ?? 0,
          wideMax,
          radiusKm(storm.galeRadius),
          CLASS_COLOUR.strong,
          `${storm.name ?? 'Unnamed system'} (${storm.seasonLabel})\nGales extended ${radiusKm(storm.galeRadius)} from the centre\nLowest pressure ${pressure(storm.minPressure)}`,
          () => ctx.openStorm(storm.sid)
        )
      );
    }
    widePanel.append(
      el(
        'p',
        'panel-note',
        `Storm size is only recorded for ${num(meta.counts.withRadii)} of ${num(meta.counts.systems)} systems, essentially all of them recent. This is a ranking of the modern record, not of all time.`
      )
    );
    host.append(widePanel);
  }

  // --- Rapid intensification: the anomaly detector ----------------------------------------
  const ri = seasons.intensification;
  const riPanel = panel(
    'Fastest strengthening',
    'The largest central-pressure fall recorded within a 24-hour window. This is the behaviour that outruns warnings.'
  );
  const drops = ri.map((r) => r.drop);
  if (drops.length) {
    const histWrap = el('div', 'x-scroll');
    histWrap.append(
      histogram(drops, {
        colour: CLASS_COLOUR.moderate,
        highlightFrom: 42,
        highlightColour: WARN,
        xLabel: 'Pressure fall in 24 hours (hPa)',
        bins: 16,
        format: (lo, hi, count) =>
          `${Math.round(lo)} to ${Math.round(hi)} hPa in 24 hours\n${count} storms${lo >= 42 ? '\nRapid intensification' : ''}`,
      })
    );
    riPanel.append(histWrap);
  }
  riPanel.append(
    sortableTable<IntensificationRow>(
      ri.slice(0, 25),
      [
        { key: 'season', label: 'Season', value: (r) => r.season, render: (r) => r.seasonLabel ?? '—' },
        {
          key: 'name',
          label: 'Storm',
          value: (r) => r.name ?? 'Unnamed',
          render: (r) => {
            const button = el('button', 'row-button', esc(r.name ?? 'Unnamed system'));
            button.type = 'button';
            button.addEventListener('click', () => ctx.openStorm(r.sid));
            return button;
          },
        },
        {
          key: 'drop',
          label: 'Pressure fall',
          numeric: true,
          value: (r) => r.drop,
          tip: 'Largest fall recorded within any 24-hour window. 42 hPa or more is conventionally rapid intensification.',
          render: (r) => `${r.drop} hPa`,
        },
        { key: 'hours', label: 'Over', numeric: true, value: (r) => r.hours, render: (r) => `${r.hours} h` },
        {
          key: 'min',
          label: 'Reached',
          numeric: true,
          value: (r) => r.minPressure,
          render: (r) => pressure(r.minPressure),
          sort: (a, b) => (b.minPressure ?? Infinity) - (a.minPressure ?? Infinity),
        },
      ],
      { initialSort: 'drop', descending: true, onRow: (r) => ctx.openStorm(r.sid) }
    )
  );
  riPanel.append(
    callout(
      `A fall of 42 hPa or more in a day is ${term('rapid intensification')} — highlighted in the
       histogram above. It is measured here from the real time between fixes, not from an assumed
       six-hourly spacing, because the archive's sampling interval changes by era and by storm.`
    )
  );
  host.append(riPanel);

  // --- Full searchable table -------------------------------------------------------------
  const all = panel(
    'Every tracked system',
    'The whole record, sortable. Use the search box in the header to jump to a storm by name.'
  );
  all.append(
    sortableTable<Storm>(
      storms,
      [
        { key: 'season', label: 'Season', value: (s) => s.season, render: (s) => s.seasonLabel ?? '—' },
        {
          key: 'name',
          label: 'Storm',
          value: (s) => s.name ?? 'zzz',
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
          render: (s) => pressure(s.minPressure),
          sort: (a, b) => (b.minPressure ?? Infinity) - (a.minPressure ?? Infinity),
        },
        {
          key: 'wind',
          label: 'Strongest wind',
          numeric: true,
          value: (s) => s.maxWind,
          render: (s) => windKmh(s.maxWind),
        },
        { key: 'hours', label: 'Duration', numeric: true, value: (s) => s.hours, render: (s) => duration(s.hours) },
        {
          key: 'coast',
          label: 'Crossed coast',
          value: (s) => (s.crossed ? s.stateName ?? 'Yes' : 'No'),
          render: (s) => (s.crossed ? s.stateName ?? 'Yes' : '—'),
        },
      ],
      { initialSort: 'season', descending: true, onRow: (s) => ctx.openStorm(s.sid) }
    )
  );
  host.append(all);
}
