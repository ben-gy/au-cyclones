// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The About panel. Covers what the site is, where the data comes from, how often it changes,
// and — at length, because it is the most important thing on the page — what the record
// cannot tell you.

import { openOverlay } from './overlay';
import { term } from './glossary';
import { esc, num } from './format';
import type { Meta } from './types';

export function openAbout(meta: Meta): void {
  const { body } = openOverlay({ variant: 'modal', title: 'About Cyclone Tracks' });

  const source = meta.source.ibtracs;
  body.innerHTML = `
    <p>Every tropical cyclone tracked in the ${term('australian region')} since ${esc(meta.firstSeasonLabel)} —
    ${num(meta.counts.systems)} systems, ${num(meta.counts.points)} recorded positions,
    ${num(meta.counts.distinctNames)} distinct storm names — on one map, with every storm
    clickable.</p>

    <h3 class="detail-section-title" style="margin-top:var(--space-xl)">Where the data comes from</h3>
    <p>The tracks are the official ${term('best track')} records published in
    <strong>${esc(source.product)}</strong> by the ${esc(source.publisher)}. Australia's tracks
    within it are the Bureau of Meteorology's own analysis: the Bureau is the
    ${term('rsmc', 'responsible warning centre')} for this part of the world, and its work
    reaches this site through ${term('ibtracs')}.</p>
    <p class="panel-note">${esc(source.citation)}</p>
    <p class="panel-note">${esc(source.paper)}</p>
    <p>Coastlines and state boundaries are ${esc(meta.source.boundaries.product)} from the
    ${esc(meta.source.boundaries.publisher)}, used under ${esc(meta.source.boundaries.licence)}.</p>

    <h3 class="detail-section-title" style="margin-top:var(--space-xl)">How often it updates</h3>
    <p>This is a historical archive, <strong>not a live warning service</strong>. If a cyclone is
    approaching, the Bureau of Meteorology is the only source you should be acting on. The
    archive is revised by NOAA periodically as seasons are analysed, and this site rebuilds
    monthly. The analysed record currently runs to the
    <strong>${esc(meta.completeThroughLabel)}</strong> season.</p>

    <h3 class="detail-section-title" style="margin-top:var(--space-xl)">What the record cannot tell you</h3>
    <p>Three limits shape everything on this site, and none of them is a detail.</p>
    <p><strong>Older storms were barely measured.</strong> Wind speed does not appear in the
    record at all before 1960 and gusts not before 1970, while central pressure exists for most
    storms right back to the 1900s. Any chart of cyclone strength built on wind therefore
    measures when instruments arrived, not what the weather did — so every long-run comparison
    here uses ${term('central pressure')}, and the
    <em>The record</em> view shows both versions side by side so you can see the difference.</p>
    <p><strong>Before about 1982, storms were missed.</strong> A cyclone that stayed away from
    land and shipping could pass unseen. Counts before the ${term('satellite era')} are lower
    than reality, and no trend line on this site crosses that boundary.</p>
    <p><strong>The current season is not finished.</strong> The archive publishes positions
    during a season but settles intensity months later. Seasons awaiting that review appear on
    the map, marked, and are excluded from every count — otherwise a season nobody has analysed
    yet would draw as a season with no cyclones.</p>

    <h3 class="detail-section-title" style="margin-top:var(--space-xl)">A note on what "severe" means here</h3>
    <p>Australia's official ${term('category', 'category 1-5 scale')} is defined on wind gusts.
    Because gusts are unusable across the historical record, this site classes a storm as
    ${term('severe')} when its central pressure fell to ${meta.severeHpa} hPa or below. That is
    a different measure from the category you hear in a warning, and it is labelled as such
    everywhere it appears.</p>
  `;
}
