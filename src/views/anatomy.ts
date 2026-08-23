// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Anatomy — the shape of a cyclone, not just its strength.
// Question it answers: are the strongest storms the biggest ones? (No, and the scatter shows
// how weakly the two are related.)

import { histogram, scatter } from '../charts';
import { attachSvgZoom } from '../utils/svgZoom';
import { callout, el, panel, statRow } from '../components/ui';
import { classColour } from '../palette';
import { term } from '../glossary';
import { esc, num, pressure, radiusKm, windKmh } from '../format';
import type { ViewContext } from './atlas';

export function renderAnatomy(host: HTMLElement, ctx: ViewContext): void {
  const { meta, storms } = ctx.bundle;

  const sized = storms.filter(
    (s) => s.galeRadius !== null && s.minPressure !== null && !s.provisional
  );

  const intro = el('div', 'view-intro');
  intro.append(el('h1', 'view-title', 'Anatomy'));
  const lede = el('p', 'view-lede');
  lede.innerHTML = `A cyclone has a size as well as a strength, and they are not the same thing. ${term('gale radius', 'Gale radius')} — how far damaging wind reaches from the centre — is only recorded for ${num(meta.counts.withRadii)} of ${num(meta.counts.systems)} systems, essentially all of them recent, so everything on this page describes the modern record.`;
  intro.append(lede);
  host.append(intro);

  if (!sized.length) {
    host.append(callout('No storm-size measurements are present in this build of the archive.'));
    return;
  }

  const radii = sized.map((s) => s.galeRadius ?? 0);
  const meanRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
  const widest = [...sized].sort((a, b) => (b.galeRadius ?? 0) - (a.galeRadius ?? 0))[0];
  const strongest = [...sized].sort((a, b) => (a.minPressure ?? 0) - (b.minPressure ?? 0))[0];

  host.append(
    statRow([
      { value: num(sized.length), label: 'storms with a size measurement', tip: 'Systems with a recorded gale-force wind radius and a central pressure.' },
      { value: radiusKm(meanRadius), label: 'average gale radius' },
      {
        value: esc(widest?.name ?? '—'),
        label: 'widest storm',
        tip: widest ? `Gales reached ${radiusKm(widest.galeRadius)} from the centre.` : '',
      },
      {
        value: esc(strongest?.name ?? '—'),
        label: 'strongest of these',
        tip: strongest ? `Reached ${pressure(strongest.minPressure)}.` : '',
      },
    ])
  );

  // --- Size against strength --------------------------------------------------------------
  const scatterPanel = panel(
    'Size against strength',
    'Each dot is one storm: how far gales reached, against how low its pressure fell. If the strongest storms were also the biggest, the dots would form a clear diagonal. They do not.'
  );
  const wrap = el('div', 'zoomable-wrap');
  const inner = el('div', 'x-scroll');
  const chart = scatter(
    sized.map((storm) => ({
      x: storm.galeRadius ?? 0,
      y: storm.minPressure ?? 1010,
      r: storm.crossed ? 5 : 3.4,
      colour: classColour(storm.cls),
      tip: `${storm.name ?? 'Unnamed system'} (${storm.seasonLabel})\nGale radius ${radiusKm(storm.galeRadius)}\nLowest pressure ${pressure(storm.minPressure)}\nStrongest wind ${windKmh(storm.maxWind)}\n${storm.crossed ? `Crossed the coast — ${storm.stateName ?? 'unresolved'}` : 'Never crossed the coast'}`,
      onClick: () => ctx.openStorm(storm.sid),
    })),
    {
      xLabel: 'Gale radius (nautical miles) — how big',
      yLabel: 'Lowest central pressure (hPa) — lower is stronger',
      // Inverted so "stronger" is higher on the page, matching how a reader reads a chart.
      invertY: true,
      width: 900,
      height: 420,
    }
  );
  inner.append(chart);
  wrap.append(inner);
  scatterPanel.append(wrap);
  attachSvgZoom(chart);
  scatterPanel.append(
    el(
      'p',
      'panel-note',
      'Larger dots crossed the coast. Colour is the same severity scale used everywhere on this site. Scroll to zoom, drag to pan, double-click to reset.'
    )
  );

  // Correlation, computed rather than asserted, so the claim in the callout is checkable.
  const xs = sized.map((s) => s.galeRadius ?? 0);
  const ys = sized.map((s) => s.minPressure ?? 0);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    cov += (xs[i] - meanX) * (ys[i] - meanY);
    vx += (xs[i] - meanX) ** 2;
    vy += (ys[i] - meanY) ** 2;
  }
  const r = cov / Math.sqrt(Math.max(1e-9, vx * vy));

  scatterPanel.append(
    callout(
      `<strong>Size and strength are related, but loosely.</strong> The correlation between gale
       radius and lowest pressure across these ${num(sized.length)} storms is
       ${Math.abs(r).toFixed(2)} — real, but far from the near-perfect relationship people assume.
       A compact, very intense cyclone can pass a town in a few hours; a weaker but much wider
       one can batter the same coast for a day and a half. Both matter, and only one of them is
       in the category number.`
    )
  );
  host.append(scatterPanel);

  // --- Duration distribution -------------------------------------------------------------
  const durationPanel = panel(
    'How long they last',
    'Time from the first tracked position to the last, for every analysed system.'
  );
  const hours = storms.filter((s) => !s.provisional && s.hours > 0).map((s) => s.hours / 24);
  const sortedDays = [...hours].sort((a, b) => a - b);
  const median = sortedDays[Math.floor(sortedDays.length / 2)];
  const histWrap = el('div', 'x-scroll');
  histWrap.append(
    histogram(hours, {
      colour: classColour('moderate'),
      xLabel: 'Days tracked',
      bins: 22,
      format: (lo, hi, count) => `${lo.toFixed(1)} to ${hi.toFixed(1)} days\n${count} systems`,
    })
  );
  durationPanel.append(histWrap);
  durationPanel.append(
    callout(
      `The median system is tracked for ${median.toFixed(1)} days. The long tail on the right is
       mostly storms that wandered the open ocean for weeks without ever threatening anyone —
       another reminder that a busy season is not automatically a damaging one.`
    )
  );
  host.append(durationPanel);
}
