// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Every domain term this site uses, defined for someone who knows nothing about cyclones.
// The audience includes Year 9 geography students and anxious residents, so nothing on the
// page may depend on already knowing what "best track" or "Dvorak" means.

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  'best track': {
    term: 'Best track',
    definition:
      "A cyclone's official path and intensity, reconstructed after the event. Forecasters revisit every satellite image, aircraft report and weather station reading and agree a single definitive history. It is more accurate than the warnings issued at the time, and it is what this site shows.",
  },
  'central pressure': {
    term: 'Central pressure',
    definition:
      'The air pressure at the very centre of the storm, in hectopascals (hPa). Lower means stronger — an ordinary day is about 1013 hPa, and Australia\'s deepest recorded cyclone, Gwenda in 1999, reached 900 hPa. This site measures long-run intensity by pressure because it is the one measure recorded consistently across the whole record.',
  },
  hpa: {
    term: 'Hectopascal (hPa)',
    definition:
      'The unit air pressure is measured in. Standard sea-level pressure is 1013 hPa. Numerically identical to the millibar you may see in older records.',
  },
  severe: {
    term: 'Severe (on this site)',
    definition:
      'A storm whose central pressure fell to 970 hPa or lower. The Bureau\'s official categories 1 to 5 are defined on wind speed, but wind was not recorded at all before 1970, so a wind-based measure cannot be compared across the record. This site therefore uses a pressure threshold and labels it as such wherever it appears.',
  },
  category: {
    term: 'Category (1 to 5)',
    definition:
      "Australia's official cyclone scale, based on the strongest wind gust expected. Category 1 damages crops and trees; category 5 destroys buildings. This site does not chart categories over time, because gust measurements only exist for recent decades and a category chart would show a rise that is entirely down to better instruments.",
  },
  'tropical cyclone': {
    term: 'Tropical cyclone',
    definition:
      'A rotating storm that forms over warm tropical ocean and has gale-force winds circling its centre. The same kind of storm is called a hurricane in the Atlantic and a typhoon in the north-west Pacific. Below gale force it is a tropical low, not a cyclone.',
  },
  'tropical low': {
    term: 'Tropical low',
    definition:
      'A tropical system that has not reached gale force. Many cyclones begin and end as lows, and lows can still cause serious flooding without ever becoming a cyclone.',
  },
  'australian region': {
    term: 'Australian region',
    definition:
      'The area of ocean the Bureau of Meteorology is formally responsible for issuing cyclone warnings in: 90°E to 160°E, south of the equator. It stretches from west of the Cocos Islands to east of the Solomon Islands. Every storm on this site is one that entered that box.',
  },
  season: {
    term: 'Cyclone season',
    definition:
      'The Australian cyclone season runs from November to April and therefore spans two calendar years, which is why it is written as "2010-11". Cyclone Yasi struck in February 2011, in the 2010-11 season.',
  },
  landfall: {
    term: 'Coast crossing (landfall)',
    definition:
      'The moment a cyclone\'s centre passes from sea to land. This site counts a crossing where the archive records the storm centre being over land at its next recorded position. A storm can cause severe damage without ever crossing the coast.',
  },
  genesis: {
    term: 'Genesis',
    definition:
      'Where a storm was first identified and tracked. Genesis locations cluster in reliably warm water and shift far less from year to year than where storms end up going.',
  },
  'gale radius': {
    term: 'Gale radius',
    definition:
      'How far gale-force winds (63 km/h and above) extend from the centre — in other words, how BIG the storm is, as opposed to how strong. A compact intense cyclone can do less total damage than a weaker but much wider one. Only recorded for recent storms.',
  },
  'rapid intensification': {
    term: 'Rapid intensification',
    definition:
      'An unusually fast strengthening, conventionally a central-pressure fall of about 42 hPa or more within 24 hours. It is the most dangerous behaviour a cyclone can show, because it can outrun the warnings issued to people in its path.',
  },
  'satellite era': {
    term: 'Satellite era',
    definition:
      'From about 1982, when continuous geostationary satellite coverage meant every cyclone in the region was seen. Before that, a storm that stayed away from land and shipping could pass unrecorded, so earlier counts are lower than reality and no trend line on this site crosses that boundary.',
  },
  ibtracs: {
    term: 'IBTrACS',
    definition:
      "The International Best Track Archive for Climate Stewardship, maintained by the United States' National Centers for Environmental Information. It gathers the official best tracks from every regional cyclone warning centre into one archive. Australia's tracks in it are the Bureau of Meteorology's own analysis.",
  },
  rsmc: {
    term: 'Warning centre (RSMC)',
    definition:
      'The meteorological agency the World Meteorological Organization makes responsible for naming and tracking cyclones in a given part of the world. The Bureau of Meteorology is the responsible centre for the Australian region.',
  },
  provisional: {
    term: 'Not yet analysed',
    definition:
      "The archive publishes a storm's positions during the season but only settles its intensity months later, once the review is complete. Seasons still awaiting that review are shown on the map but excluded from every count and trend, because charting them would draw a season with no measured storms as a season with no storms.",
  },
  unmeasured: {
    term: 'Not recorded',
    definition:
      'No value exists in the archive for this storm. It does not mean zero, and it does not mean weak — it means nobody measured it. Roughly a fifth of storms in the 1980s have no central-pressure reading at all.',
  },
};

/** Wrap a term in a clickable info affordance. `key` must exist in GLOSSARY. */
export function term(key: string, label?: string): string {
  const entry = GLOSSARY[key];
  if (!entry) return label ?? key;
  return `<button type="button" class="glossary-link" data-term="${key}">${label ?? entry.term}</button>`;
}
