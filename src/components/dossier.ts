// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The per-storm drill-down. Opens as a drawer over any view, is deep-linkable, and loads the
// intensity payload on first use.

import { loadProfiles } from '../data';
import { openOverlay } from '../overlay';
import { classColour, ACCENT, ACCENT_SOFT } from '../palette';
import { profileLine } from '../charts';
import { el, callout } from './ui';
import { term } from '../glossary';
import {
  NOT_RECORDED,
  dateUtc,
  duration,
  esc,
  latLon,
  num,
  pressure,
  radiusKm,
  stormTitle,
  windKmh,
} from '../format';
import type { Meta, Storm } from '../types';

function item(label: string, value: string): HTMLElement {
  const node = el('div', 'detail-item');
  node.append(el('div', 'detail-label', esc(label)), el('div', 'detail-value', esc(value)));
  return node;
}

export function openDossier(storm: Storm, meta: Meta, onClose: () => void): void {
  const { body } = openOverlay({
    variant: 'drawer',
    title: stormTitle(storm.name, storm.seasonLabel),
    className: 'storm-dossier',
    onClose,
  });

  if (storm.provisional) {
    body.append(
      callout(
        `This storm is in the ${esc(storm.seasonLabel ?? 'current')} season, which the archive has published positions for but has ${term('provisional', 'not yet analysed')}. Its track is shown; its intensity is not yet settled, so it is excluded from every count and trend on this site.`,
        true
      )
    );
  }

  const pill = el('span', 'pill');
  pill.style.background = classColour(storm.cls);
  pill.textContent = storm.minPressure === null ? NOT_RECORDED : pressure(storm.minPressure);

  const header = el('div');
  header.style.marginBottom = 'var(--space-lg)';
  header.append(pill);
  if (storm.severe) {
    const severe = el('span', 'pill pill-muted');
    severe.style.marginLeft = 'var(--space-sm)';
    severe.textContent = `Severe (at or below ${meta.severeHpa} hPa)`;
    header.append(severe);
  }
  body.append(header);

  const meta1 = el('div', 'detail-meta');
  meta1.append(
    item('Lowest central pressure', pressure(storm.minPressure)),
    item('Strongest sustained wind', windKmh(storm.maxWind)),
    item('Strongest gust', windKmh(storm.maxGust)),
    item('Widest gale radius', radiusKm(storm.galeRadius)),
    item('Duration tracked', duration(storm.hours)),
    item('Track fixes', num(storm.points)),
    item('First tracked', dateUtc(storm.start)),
    item('Last tracked', dateUtc(storm.end))
  );
  body.append(meta1);

  const where = el('div', 'detail-section');
  where.append(el('h3', 'detail-section-title', 'Where it formed and went'));
  const meta2 = el('div', 'detail-meta');
  meta2.append(
    item('Formed near', latLon(storm.genLat, storm.genLon)),
    item(
      'Crossed the coast',
      storm.crossed ? storm.stateName ?? 'Yes — location not resolved' : 'No'
    ),
    item('Crossing point', storm.crossed ? latLon(storm.lfLat, storm.lfLon) : '—')
  );
  where.append(meta2);
  body.append(where);

  // Intensity profile — the payload arrives on first open and is shared thereafter.
  const profileSection = el('div', 'detail-section');
  profileSection.append(el('h3', 'detail-section-title', 'Intensity through the storm'));
  const chartHost = el('div');
  chartHost.append(el('div', 'loading', 'Loading intensity record…'));
  profileSection.append(chartHost);
  body.append(profileSection);

  loadProfiles()
    .then((profiles) => {
      const profile = profiles[storm.sid];
      chartHost.innerHTML = '';
      if (!profile) {
        chartHost.append(el('p', 'panel-note', 'No intensity record for this system.'));
        return;
      }

      const hasPressure = profile.p.some((v) => v !== null);
      const hasWind = profile.w.some((v) => v !== null);

      if (hasPressure) {
        const wrap = el('div', 'x-scroll');
        wrap.append(
          profileLine(profile.t, profile.p, {
            colour: ACCENT,
            yLabel: 'Central pressure (hPa)',
            // Lower pressure means a stronger storm, so the axis is inverted: deeper is
            // higher on the page, which is how a reader expects "stronger" to look.
            invertY: true,
            tipFor: (_i, value, minutes) =>
              `${pressure(value)}\n${(minutes / 60).toFixed(0)} hours from first fix`,
          })
        );
        chartHost.append(wrap);
        chartHost.append(
          el(
            'p',
            'panel-note',
            'Lower is stronger, so the line rises as the storm deepens. Gaps are fixes with no pressure recorded — not calm spells.'
          )
        );
      }

      if (hasWind) {
        const wrap = el('div', 'x-scroll');
        wrap.append(
          profileLine(profile.t, profile.w, {
            colour: ACCENT_SOFT,
            yLabel: 'Sustained wind (knots)',
            tipFor: (_i, value, minutes) =>
              `${windKmh(value)} (${num(value)} kt)\n${(minutes / 60).toFixed(0)} hours from first fix`,
          })
        );
        chartHost.append(wrap);
      }

      if (!hasPressure && !hasWind) {
        chartHost.append(
          callout(
            `Neither pressure nor wind was recorded for this system — only its position. That is ${term('unmeasured', 'not the same as')} a weak storm; it means nobody measured it.`
          )
        );
      }
    })
    .catch(() => {
      chartHost.innerHTML = '';
      chartHost.append(el('p', 'error-box', 'Could not load the intensity record.'));
    });

  // What was and was not measured — the site's honesty mechanic, per storm.
  const basis = el('div', 'detail-section');
  basis.append(el('h3', 'detail-section-title', 'What was measured'));
  const list = el('div', 'detail-meta');
  list.append(
    item('Central pressure', storm.basis.pressure ? 'Recorded' : NOT_RECORDED),
    item('Sustained wind', storm.basis.wind ? 'Recorded' : NOT_RECORDED),
    item('Wind gusts', storm.basis.gust ? 'Recorded' : NOT_RECORDED),
    item('Storm size', storm.basis.radii ? 'Recorded' : NOT_RECORDED)
  );
  basis.append(list);
  basis.append(
    el(
      'p',
      'panel-note',
      'Older storms were measured with far less than modern ones. A blank here means no observation exists, never a reading of zero.'
    )
  );
  body.append(basis);
}
