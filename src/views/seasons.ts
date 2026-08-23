// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Seasons — how many, how strong, season by season.
// Question it answers: are there more cyclones than there used to be? (No. And the more
// interesting half of the answer is what happened to the SEVERE ones.)

import { barSeries, legendHtml, trendOverlay } from '../charts';
import { callout, el, panel, sortableTable, statRow } from '../components/ui';
import { CLASS_COLOUR, ACCENT, ACCENT_SOFT } from '../palette';
import { term } from '../glossary';
import { esc, num, pressure } from '../format';
import type { ViewContext } from './atlas';
import type { SeasonRow } from '../types';

export function renderSeasons(host: HTMLElement, ctx: ViewContext): void {
  const { meta, seasons } = ctx.bundle;
  const rows = seasons.seasons;
  const analysed = rows.filter(
    (r) => r.season >= meta.satelliteEraStart && r.season <= meta.completeThroughSeason
  );
  const [early, , late] = meta.eras;

  const intro = el('div', 'view-intro');
  intro.append(el('h1', 'view-title', 'Seasons'));
  const lede = el('p', 'view-lede');
  lede.innerHTML = `Each ${term('season')} from ${esc(meta.firstSeasonLabel)} to ${esc(meta.completeThroughLabel)}. Counts before the ${term('satellite era')} are lower than reality because storms out at sea were simply never seen — so the trend line below starts at ${meta.satelliteEraStart - 1}-${String(meta.satelliteEraStart % 100).padStart(2, '0')} and never crosses that boundary.`;
  intro.append(lede);
  host.append(intro);

  host.append(
    statRow([
      {
        value: early.perSeason.toFixed(1),
        label: `cyclones per season, ${esc(early.label)}`,
        tip: `${num(early.storms)} tropical cyclones across ${early.seasons} seasons.`,
      },
      {
        value: late.perSeason.toFixed(1),
        label: `cyclones per season, ${esc(late.label)}`,
        tip: `${num(late.storms)} tropical cyclones across ${late.seasons} seasons.`,
      },
      {
        value: early.severePerSeason.toFixed(1),
        label: `severe per season, ${esc(early.label)}`,
        tip: `Storms reaching ${meta.severeHpa} hPa or lower.`,
      },
      {
        value: late.severePerSeason.toFixed(1),
        label: `severe per season, ${esc(late.label)}`,
        tip: `Storms reaching ${meta.severeHpa} hPa or lower.`,
      },
    ])
  );

  // --- The main series -----------------------------------------------------------------
  const chartPanel = panel(
    'Cyclones per season',
    'Every bar is one season. The darker block inside each bar is the storms that reached severe strength.'
  );
  const chartWrap = el('div', 'x-scroll');
  const data = rows.map((row) => ({
    label: row.label.slice(0, 4),
    value: row.count,
    colour: row.season >= meta.satelliteEraStart ? ACCENT_SOFT : '#d8d2c6',
    tip: `${row.label}\n${row.count} tropical cyclones\n${row.severeCount} severe (at or below ${meta.severeHpa} hPa)\n${row.crossings} crossed the coast\n${row.withPressure} of ${row.count} had a pressure recorded`,
    onClick: () => ctx.goTo('atlas'),
  }));
  const chart = barSeries(data, {
    overlay: {
      values: rows.map((r) => r.severeCount),
      colour: CLASS_COLOUR.severe,
      label: 'Severe',
    },
    yLabel: 'Cyclones',
    width: Math.max(1080, rows.length * 9),
  });
  // Trend over the analysed satellite era only. Values outside it are null so the fit cannot
  // silently include the detection-limited years.
  trendOverlay(
    chart,
    rows.map((r) =>
      r.season >= meta.satelliteEraStart && r.season <= meta.completeThroughSeason ? r.count : null
    ),
    ACCENT,
    `Trend, ${meta.satelliteEraStart - 1}-${String(meta.satelliteEraStart % 100).padStart(2, '0')} onward:\n${meta.trend.countPerDecade} cyclones per decade`,
    { width: Math.max(1080, rows.length * 9) }
  );
  chartWrap.append(chart);
  chartPanel.append(chartWrap);
  chartPanel.insertAdjacentHTML(
    'beforeend',
    legendHtml([
      { colour: ACCENT_SOFT, label: 'Cyclones (satellite era)', tip: 'From 1981-82, when every storm in the region was seen.' },
      { colour: '#d8d2c6', label: 'Cyclones (before 1981-82)', tip: 'Detection-limited: storms away from land and shipping went unrecorded.' },
      { colour: CLASS_COLOUR.severe, label: `Severe (at or below ${meta.severeHpa} hPa)` },
      { colour: ACCENT, label: 'Satellite-era trend' },
    ])
  );
  host.append(chartPanel);

  // --- The finding, stated plainly and with its own caveat ------------------------------
  const finding = panel('What the seasons show');
  finding.append(
    callout(
      `<strong>Cyclones have become less frequent, and severe ones have fallen faster.</strong>
       Across the ${esc(early.label)} seasons the region averaged ${early.perSeason} tropical cyclones
       a year, of which ${early.severePerSeason} reached ${meta.severeHpa} hPa or lower. By
       ${esc(late.label)} that was ${late.perSeason} cyclones and ${late.severePerSeason} severe —
       a fall of ${Math.round((100 * (early.perSeason - late.perSeason)) / early.perSeason)}% in
       storms overall but ${Math.round((100 * (early.severePerSeason - late.severePerSeason)) / early.severePerSeason)}% in severe ones.`
    )
  );
  finding.append(
    callout(
      `<strong>This is not a measurement artefact, and that is worth checking rather than assuming.</strong>
       If fewer storms were being measured, severe ones would go missing and the decline would be
       fake. The opposite happened: the share of storms with a central-pressure reading
       <em>rose</em> from ${early.coverage}% to ${late.coverage}% over the same period, and the
       median lowest pressure rose from ${pressure(early.medianMinPressure)} to
       ${pressure(late.medianMinPressure)}. The record got better while the storms got weaker.`
    )
  );
  finding.append(
    callout(
      `<strong>The honest caveat.</strong> Best-track intensity is an <em>estimate</em>, mostly
       derived from satellite imagery by a technique that has itself been revised over the
       decades. A change in how analysts assign pressure would look identical to a change in the
       weather. Treat the frequency decline as solid and the severity decline as real in the
       record but harder to attribute. The <em>${esc('The record')}</em> view sets out what the
       archive can and cannot support.`,
      true
    )
  );
  host.append(finding);

  // --- Leaderboard ---------------------------------------------------------------------
  const tablePanel = panel(
    'Season by season',
    'Sort any column. Click a season to see its storms on the map.'
  );
  tablePanel.append(
    sortableTable<SeasonRow>(
      rows,
      [
        {
          key: 'label',
          label: 'Season',
          value: (r) => r.label,
          sort: (a, b) => a.season - b.season,
          render: (r) => {
            const button = el('button', 'row-button', esc(r.label));
            button.type = 'button';
            button.addEventListener('click', () => ctx.goTo('atlas'));
            return button;
          },
        },
        { key: 'count', label: 'Cyclones', numeric: true, value: (r) => r.count, tip: 'Systems reaching tropical-cyclone strength.' },
        { key: 'severe', label: 'Severe', numeric: true, value: (r) => r.severeCount, tip: `Reached ${meta.severeHpa} hPa or lower.` },
        { key: 'crossings', label: 'Coast crossings', numeric: true, value: (r) => r.crossings },
        {
          key: 'deepest',
          label: 'Deepest',
          numeric: true,
          value: (r) => r.deepest,
          tip: 'Lowest central pressure reached by any storm that season. Lower is stronger.',
          render: (r) => (r.deepest === null ? 'Not recorded' : `${r.deepest} hPa`),
          sort: (a, b) => (b.deepest ?? Infinity) - (a.deepest ?? Infinity),
        },
        { key: 'trackDays', label: 'Storm days', numeric: true, value: (r) => r.trackDays, tip: 'Total days with a cyclone somewhere in the region.' },
        {
          key: 'measured',
          label: 'Measured',
          numeric: true,
          value: (r) => (r.count ? Math.round((100 * r.withPressure) / r.count) : null),
          tip: 'Share of that season\'s cyclones with a central-pressure reading. Low values mean the season is under-measured, not calm.',
          render: (r) => (r.count ? `${Math.round((100 * r.withPressure) / r.count)}%` : '—'),
        },
      ],
      { initialSort: 'count', descending: true }
    )
  );
  host.append(tablePanel);

  if (meta.provisionalSeasons.length) {
    const labels = meta.provisionalSeasons
      .map((s) => `${s - 1}-${String(s % 100).padStart(2, '0')}`)
      .join(', ');
    host.append(
      callout(
        `The ${esc(labels)} season is absent from this table on purpose. The archive has published
         its storm positions but has ${term('provisional', 'not yet analysed')} their intensity, so
         counting it would draw a season nobody has finished reviewing as a season with no
         cyclones. Its tracks are on the map, in grey.`,
        true
      )
    );
  }

  const analysedNote = el('p', 'panel-note');
  analysedNote.textContent = `Trend computed over ${analysed.length} analysed satellite-era seasons: ${meta.trend.countPerDecade} cyclones and ${meta.trend.severePerDecade} severe cyclones per decade.`;
  host.append(analysedNote);
}
