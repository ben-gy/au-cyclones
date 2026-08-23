// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// One definition of colour for the whole site. A severity class is the same colour on the
// map, in the bars, in the scatter, in the matrix and on the dossier — defined here once and
// referenced everywhere, never re-picked per view.
//
// This is a hazard site, so the ramp deliberately avoids warning-red. Red on a cyclone page
// means "a cyclone is coming"; using it for a storm from 1974 is a false alarm in the reader's
// peripheral vision. The ramp runs pale sand -> teal -> deep indigo, which is sequential,
// colour-blind-safe, and reads correctly in greyscale.

import type { PressureClassId } from './types';

export const CLASS_COLOUR: Record<PressureClassId, string> = {
  extreme: '#2a1a5e',
  severe: '#3b4c9c',
  strong: '#3f83a3',
  moderate: '#7db8a8',
  weak: '#cbd8c0',
};

/** Storms with no measured pressure. Explicitly NOT the "weak" colour — an unmeasured storm
 *  is not a weak one, and colouring it as one is the site's central mistake in miniature. */
export const UNMEASURED_COLOUR = '#b9b3aa';

export const CLASS_ORDER: PressureClassId[] = ['extreme', 'severe', 'strong', 'moderate', 'weak'];

export function classColour(cls: PressureClassId | null): string {
  return cls ? CLASS_COLOUR[cls] : UNMEASURED_COLOUR;
}

/** Accent used for the single highlighted series in charts. */
export const ACCENT = '#0d6e8c';
export const ACCENT_SOFT = '#8fc4d4';
/** Reserved for the one genuinely cautionary mark on the site: the misleading gust-derived
 *  series in the record-quality view, which exists to be argued with. */
export const WARN = '#b4552d';
