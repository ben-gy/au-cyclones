// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The record — why the obvious cyclone chart lies.
//
// This view exists because the single most quotable chart available from this data is wrong.
// Deriving cyclone severity from wind gusts produces a catastrophic-looking rise that is
// entirely an artefact of when instruments arrived. Rather than quietly using pressure and
// mentioning the problem in a footnote, the site draws BOTH versions side by side and lets the
// reader watch the artefact appear. The refutation is the view.

import { barSeries, matrix, legendHtml } from '../charts';
import { callout, el, panel } from '../components/ui';
import { CLASS_COLOUR, WARN } from '../palette';
import { term } from '../glossary';
import { esc, num, pressure } from '../format';
import type { ViewContext } from './atlas';

/** A pale-to-deep ramp for coverage percentages. */
function coverageColour(percent: number): string {
  if (percent >= 95) return '#2a5d70';
  if (percent >= 75) return '#3f83a3';
  if (percent >= 50) return '#7db8a8';
  if (percent >= 25) return '#b9d3bd';
  if (percent > 0) return '#e2e0d2';
  return '#efece4';
}

export function renderRecord(host: HTMLElement, ctx: ViewContext): void {
  const { meta, seasons } = ctx.bundle;
  const decades = seasons.decades;
  const twoWays = seasons.severityTwoWays;

  const intro = el('div', 'view-intro');
  intro.append(el('h1', 'view-title', 'What the record can tell you'));
  const lede = el('p', 'view-lede');
  lede.innerHTML = `Every chart on this site is limited by what was actually measured, and the limits are severe enough to invert a conclusion. This page shows exactly where they bite — including the one chart this site deliberately does not use.`;
  intro.append(lede);
  host.append(intro);

  // --- The two versions of the same question ---------------------------------------------
  const compare = panel(
    'The same question, answered two ways',
    'How many severe cyclones has each decade had? On the left, severity read from wind gusts. On the right, severity read from central pressure. One of these is a record of the weather; the other is a record of when instruments arrived.'
  );

  const grid = el('div');
  grid.style.display = 'grid';
  grid.style.gap = 'var(--space-lg)';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))';

  const gustBox = el('div');
  gustBox.append(el('h3', 'detail-section-title', 'Severity from wind gusts — misleading'));
  const gustWrap = el('div', 'x-scroll');
  gustWrap.append(
    barSeries(
      twoWays.map((d) => ({
        label: d.label,
        value: d.byGust,
        colour: WARN,
        tip: `${d.label}\n${d.byGust} storms with a recorded gust at or above 90 kt\nout of ${d.storms} cyclones that decade\n\nThis rises because gusts began to be recorded, not because storms got worse.`,
      })),
      { width: 520, height: 240, yLabel: 'Storms', tickEvery: 2 }
    )
  );
  gustBox.append(gustWrap);

  const presBox = el('div');
  presBox.append(el('h3', 'detail-section-title', 'Severity from central pressure — used here'));
  const presWrap = el('div', 'x-scroll');
  presWrap.append(
    barSeries(
      twoWays.map((d) => ({
        label: d.label,
        value: d.byPressure,
        colour: CLASS_COLOUR.severe,
        tip: `${d.label}\n${d.byPressure} storms reaching ${meta.severeHpa} hPa or lower\nout of ${d.storms} cyclones that decade`,
      })),
      { width: 520, height: 240, yLabel: 'Storms', tickEvery: 2 }
    )
  );
  presBox.append(presWrap);

  grid.append(gustBox, presBox);
  compare.append(grid);

  const firstGust = twoWays.find((d) => d.byGust > 0);
  const gustlessDecades = twoWays.filter((d) => d.byGust === 0);
  const peakGust = [...twoWays].sort((a, b) => b.byGust - a.byGust)[0];
  const peakPressure = [...twoWays].sort((a, b) => b.byPressure - a.byPressure)[0];
  const latest = twoWays[twoWays.length - 1];

  compare.append(
    callout(
      `<strong>The left-hand chart is the trap.</strong> It reads as severe cyclones climbing
       from <em>none at all</em> to a peak in the ${esc(peakGust?.label ?? '')} — and it is an
       illusion. Gust measurements do not exist in this archive before
       ${firstGust ? esc(firstGust.label) : 'the 1970s'}: ${gustlessDecades.length} consecutive
       decades are pinned to zero no matter how violent their storms were. The rise you are
       looking at is the arrival of instruments.`,
      true
    )
  );
  compare.append(
    callout(
      `<strong>Read on the measure that exists throughout, the peak moves.</strong> By central
       pressure the worst decade was the ${esc(peakPressure?.label ?? '')}, with
       ${num(peakPressure?.byPressure ?? 0)} severe cyclones, and the count has fallen to
       ${num(latest?.byPressure ?? 0)} in the ${esc(latest?.label ?? '')}. Same archive, same
       question, opposite conclusion about where we are now.`
    )
  );
  compare.append(
    callout(
      `<strong>And the right-hand chart is not innocent either.</strong> Its own early decades
       are low for a different reason — before satellites, storms out at sea were never found
       at all, so the 1910s genuinely had more cyclones than the four this archive records. Neither
       chart can be read as a straight history back to 1900. That is why the trend on the
       Seasons view starts in the ${term('satellite era')} and goes no further back.`
    )
  );
  host.append(compare);

  // --- The coverage matrix ----------------------------------------------------------------
  const matrixPanel = panel(
    'What was measured, decade by decade',
    'The share of that decade\'s cyclones with each kind of measurement. Read it as the ceiling on any claim: you cannot say anything about storm size in the 1950s, because nobody recorded it.'
  );
  const metrics = [
    { key: 'pressure' as const, label: 'Central pressure' },
    { key: 'wind' as const, label: 'Sustained wind' },
    { key: 'gust' as const, label: 'Wind gusts' },
    { key: 'radii' as const, label: 'Storm size' },
  ];
  const matrixWrap = el('div', 'x-scroll');
  matrixWrap.append(
    matrix(
      metrics.map((m) => m.label),
      decades.map((d) => d.label),
      (r, c) => {
        const metric = metrics[r];
        const decade = decades[c];
        const value = decade[metric.key];
        return {
          value,
          colour: coverageColour(value),
          label: value === 0 ? '—' : `${value}%`,
          tip: `${metric.label}, ${decade.label}\n${value}% of that decade's ${decade.storms} cyclones have a reading\n${value === 0 ? '\nNo measurements of this kind exist for this decade at all.' : ''}`,
        };
      },
      { cellW: 58, cellH: 34, labelW: 128 }
    )
  );
  matrixPanel.append(matrixWrap);
  matrixPanel.insertAdjacentHTML(
    'beforeend',
    legendHtml([
      { colour: coverageColour(0), label: 'None' },
      { colour: coverageColour(30), label: 'Under half' },
      { colour: coverageColour(60), label: 'Most' },
      { colour: coverageColour(80), label: 'Nearly all' },
      { colour: coverageColour(100), label: 'Effectively complete' },
    ])
  );
  matrixPanel.append(
    callout(
      `Central pressure is the only row that is populated across the whole table, which is the
       entire reason this site measures ${term('severe', 'severity')} by pressure rather than by
       the ${term('category', 'category scale')} you hear in a warning. A dash means no
       measurement of that kind exists for that decade — ${term('unmeasured', 'not a reading of zero')}.`
    )
  );
  host.append(matrixPanel);

  // --- Detection ----------------------------------------------------------------------------
  const detection = panel(
    'Storms that were never seen',
    'Before continuous satellite coverage, a cyclone that stayed away from land and shipping could pass entirely unrecorded.'
  );
  const seasonRows = seasons.seasons;
  const preSat = seasonRows.filter((s) => s.season < meta.satelliteEraStart && s.season >= 1907);
  const postSat = seasonRows.filter(
    (s) => s.season >= meta.satelliteEraStart && s.season <= meta.completeThroughSeason
  );
  const meanOf = (list: typeof seasonRows) =>
    list.length ? list.reduce((sum, s) => sum + s.count, 0) / list.length : 0;

  detection.append(
    callout(
      `The record averages ${meanOf(preSat).toFixed(1)} cyclones a season before
       ${meta.satelliteEraStart - 1}-${String(meta.satelliteEraStart % 100).padStart(2, '0')} and
       ${meanOf(postSat).toFixed(1)} after it. That jump is not a change in the weather — it is the
       moment the region started being watched continuously. It is also why the trend line on the
       Seasons view begins at the ${term('satellite era')} and stops at
       ${esc(meta.completeThroughLabel)}: a fit across that boundary would measure the
       satellites, and a fit through the unanalysed current season would measure the backlog.`
    )
  );
  host.append(detection);

  // --- Provenance ---------------------------------------------------------------------------
  const provenance = panel('Where these numbers come from');
  provenance.innerHTML += `
    <p>${esc(meta.source.ibtracs.product)}, published by the ${esc(meta.source.ibtracs.publisher)}.
    The Australian-region tracks within it are the Bureau of Meteorology's own
    ${term('best track')} analysis, contributed as the
    ${term('rsmc', 'responsible warning centre')} for this region.</p>
    <p class="panel-note">${esc(meta.source.ibtracs.citation)}</p>
    <p class="panel-note">${esc(meta.source.ibtracs.paper)}</p>
    <p class="panel-note">Boundaries: ${esc(meta.source.boundaries.product)},
    ${esc(meta.source.boundaries.publisher)} (${esc(meta.source.boundaries.licence)}).</p>
  `;

  // The build gates, published. A site that claims its numbers reconcile should show the
  // checks that say so.
  const passed = meta.gates.filter((g) => g.pass).length;
  const gateList = el('div', 'detail-section');
  gateList.append(
    el('h3', 'detail-section-title', `Build checks — ${passed} of ${meta.gates.length} passed`)
  );
  const list = el('ul');
  list.style.fontSize = 'var(--font-size-sm)';
  list.style.color = 'var(--text-secondary)';
  list.style.paddingLeft = '1.1rem';
  for (const gate of meta.gates) {
    const item = el('li');
    item.style.marginBottom = '3px';
    item.textContent = `${gate.pass ? '✓' : '✗'} ${gate.name} — ${gate.detail}`;
    list.append(item);
  }
  gateList.append(list);
  gateList.append(
    el(
      'p',
      'panel-note',
      'These run at build time and the build fails if any of them does. Six of them check named storms against their published central pressures — Gwenda 900 hPa, Yasi 929, Tracy 950 — so a change in the upstream archive is caught rather than quietly shipped.'
    )
  );
  provenance.append(gateList);
  host.append(provenance);

  const deepestGate = meta.gates.find((g) => g.name === 'headline:pressure coverage did not fall');
  if (deepestGate) {
    host.append(
      callout(
        `<strong>The check behind the headline.</strong> ${esc(deepestGate.detail)}. If coverage had
         fallen, the decline in severe storms shown on the Seasons view would be a measurement
         artefact and this site would not print it. It rose, so the decline is measured against
         an improving record. That check runs on every build, and the build fails if it stops
         being true.`
      )
    );
  }

  const note = el('p', 'panel-note');
  note.textContent = `Archive last processed ${new Date(meta.generated).toISOString().slice(0, 10)}. Analysed record runs to ${meta.completeThroughLabel}. Deepest storm on record: ${pressure(Math.min(...seasonRows.map((s) => s.deepest ?? Infinity)))}.`;
  host.append(note);
}
