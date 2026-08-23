// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Every remote thing this project fetches, in one place, with its licence attached.
//
// THE BUREAU'S OWN CYCLONE FILE IS DELIBERATELY ABSENT AND MUST STAY ABSENT.
//
// BOM publishes the same best-track content as a CSV under bom.gov.au/clim_data/, and it is a
// friendlier file — it even carries observed storm-surge, wave and reported-wind fields that
// IBTrACS does not. It is not here, and it must not be added.
//
// The Bureau's copyright page (https://www.bom.gov.au/copyright) states, for content whose
// page declares no terms of use:
//
//   "Unless we state otherwise, you can download, copy and use our content for personal use,
//    or use within your organisation. You must not supply it to any other person or use it
//    for any commercial purpose."
//
// The cyclone database page declares no terms of use, so that default governs. A public
// website supplies the content to other persons, which is the prohibited act — and the two
// prohibitions are independent, so being free and non-commercial does not cure it. The same
// page separately forbids using "automated or manual techniques to ... extract material from
// our site" and reserves the right to block an IP without notice.
//
// Adding the file "just as a fallback" is the same act. If those extra fields are wanted, the
// route is written permission from the Bureau, not a fetch.

export const SOURCES = {
  ibtracs: {
    publisher: 'NOAA National Centers for Environmental Information',
    product: 'IBTrACS v04r01',
    licence: 'Open — WMO Resolution 40; citation required',
    homepage: 'https://www.ncei.noaa.gov/products/international-best-track-archive',
    citation:
      'Gahtan, J., K. R. Knapp, C. J. Schreck III, H. J. Diamond, J. P. Kossin, M. C. Kruk (2024). International Best Track Archive for Climate Stewardship (IBTrACS) Project, Version 4.01, Southern Indian and South Pacific basins. NOAA National Centers for Environmental Information.',
    paper:
      'Knapp, K. R., M. C. Kruk, D. H. Levinson, H. J. Diamond, and C. J. Neumann, 2010: The International Best Track Archive for Climate Stewardship (IBTrACS): Unifying tropical cyclone best track data. Bulletin of the American Meteorological Society, 91, 363-376. doi:10.1175/2009BAMS2755.1',
    // The Bureau's analysis reaches this site through IBTrACS's BOM_* columns, under NCEI's
    // stated agreements with the Regional Specialized Meteorological Centres. BOM is the
    // RSMC for the Australian region and must be credited as the originating analyst.
    originatingAgency:
      'Australian Bureau of Meteorology (Regional Specialised Meteorological Centre for the Australian region), via IBTrACS',
    files: [
      {
        basin: 'SI',
        name: 'ibtracs.SI.list.v04r01.csv',
        url: 'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.SI.list.v04r01.csv',
      },
      {
        basin: 'SP',
        name: 'ibtracs.SP.list.v04r01.csv',
        url: 'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.SP.list.v04r01.csv',
      },
    ],
  },
  boundaries: {
    publisher: 'Australian Bureau of Statistics',
    product: 'ASGS state and territory boundaries (simplified)',
    licence: 'CC BY 4.0',
    homepage: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3',
    // Copied from the factory's patterns/geo directory rather than downloaded, so the build
    // is reproducible and the file is known-good. Never hand-author coordinates.
    localSource: 'patterns/geo/au-states.geojson',
  },
};

/** A browser-ish User-Agent. NCEI serves plain files, but a bare default UA gets throttled by
 *  enough government hosts that this is simply the house style. */
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
