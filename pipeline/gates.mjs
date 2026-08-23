// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Build-failing correctness gates.
//
// The rule these encode: a row COUNT is not completeness, and a number that reproduces is not
// necessarily the right number. Each gate below either reconciles the output against a fact
// established independently of the pipeline, or fails the build. A gate that only checks
// "we produced some rows" is not a gate.

/**
 * @param {string} name
 * @param {boolean} pass
 * @param {string} detail
 * @param {boolean} advisory advisory gates report but do not fail the build
 */
function gate(name, pass, detail, advisory = false) {
  return { name, pass: Boolean(pass), detail, advisory };
}

/**
 * @param {object} ctx
 * @returns {{gates: object[], failed: object[]}}
 */
export function runGates(ctx) {
  const { storms, seasons, points, byState, meta } = ctx;
  const tropical = storms.filter((s) => s.isTropicalCyclone);
  const gates = [];

  // --- Anchors verified by hand against the Bureau's published records and against BOM's
  // own IDCKMSTM0S.csv before that file was set aside on licence grounds. If IBTrACS ever
  // reanalyses these storms these gates fire, which is exactly what we want to be told.
  const anchors = [
    { name: 'Gwenda', pressure: 900 },
    { name: 'George', pressure: 902 },
    { name: 'Orson', pressure: 905 },
    { name: 'Marcus', pressure: 905 },
    { name: 'Yasi', pressure: 929 },
    { name: 'Tracy', pressure: 950 },
  ];
  for (const anchor of anchors) {
    const matches = storms.filter((s) => s.name === anchor.name && s.minPressure !== null);
    const deepest = matches.length ? Math.min(...matches.map((s) => s.minPressure)) : null;
    gates.push(
      gate(
        `anchor:${anchor.name}`,
        deepest === anchor.pressure,
        `deepest ${anchor.name} = ${deepest} hPa, expected ${anchor.pressure}`
      )
    );
  }

  // --- Every track point must be inside BOM's area of responsibility. A single escapee means
  // the region filter regressed and the site is quietly showing Indian Ocean or South
  // American storms as Australian.
  const strays = points.filter((p) => !(p.lat < 0 && p.lon >= 90 && p.lon <= 160));
  gates.push(
    gate('region:all points in 90-160E southern hemisphere', strays.length === 0, `${strays.length} stray points`)
  );

  // --- No NaN or null coordinate may reach the client. NaN survives JSON.stringify as null
  // and renders as a track that silently jumps to the top-left of the map.
  const badCoords = points.filter(
    (p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !Number.isFinite(p.lonUnwrapped)
  );
  gates.push(gate('coords:finite', badCoords.length === 0, `${badCoords.length} non-finite coordinates`));

  // --- Unwrapped longitude must never jump more than 180 degrees between consecutive points,
  // or the polyline draws a stripe straight across the Pacific.
  let maxJump = 0;
  for (const s of storms) {
    for (let i = 1; i < s.points.length; i += 1) {
      maxJump = Math.max(maxJump, Math.abs(s.points[i].lonUnwrapped - s.points[i - 1].lonUnwrapped));
    }
  }
  gates.push(gate('coords:no antimeridian jump', maxJump <= 180, `largest step ${maxJump.toFixed(1)} degrees`));

  // --- Season arithmetic. IBTrACS SEASON is the year the southern season ENDS, so the label
  // must be one year earlier. Cyclone Tracy struck Darwin on 24 December 1974 and is
  // SEASON=1975; if the label ever reads "1975-76" the whole time axis has shifted.
  const tracy = storms.find((s) => s.name === 'Tracy' && s.season === 1975);
  gates.push(
    gate(
      'season:Tracy is labelled 1974-75',
      tracy?.seasonLabel === '1974-75',
      `Tracy season label = ${tracy?.seasonLabel ?? 'MISSING'}`
    )
  );

  // --- Storm totals must reconcile with the per-season table, or one of them is wrong.
  const seasonTotal = seasons.reduce((sum, s) => sum + s.count, 0);
  const tropicalWithSeason = tropical.filter((s) => s.season !== null).length;
  gates.push(
    gate(
      'reconcile:season counts sum to tropical storms',
      seasonTotal === tropicalWithSeason,
      `seasons sum ${seasonTotal} vs tropical storms ${tropicalWithSeason}`
    )
  );

  // --- Severe storms are a subset of storms that have a pressure at all. If severeCount ever
  // exceeds withPressure, a null pressure is being read as zero — which would classify every
  // unmeasured storm as the most intense possible.
  const impossible = seasons.filter((s) => s.severeCount > s.withPressure);
  gates.push(
    gate('severity:severe subset of measured', impossible.length === 0, `${impossible.length} impossible seasons`)
  );

  // --- THE PROVISIONAL-SEASON GATE. IBTrACS publishes the current season's positions long
  // before it analyses intensity: at build time the 2025-26 season had 15 systems, every one
  // NATURE=NR with a null pressure. Charted naively that is a spectacular collapse to zero
  // cyclones in the most recent season, which reads as a finding and is an archive artefact.
  // The analysed record must therefore end at a season where intensity actually exists.
  const complete = seasons.filter((s) => s.season <= meta.completeThroughSeason);
  const lastComplete = complete[complete.length - 1];
  gates.push(
    gate(
      'provisional:analysed record ends on a measured season',
      lastComplete && lastComplete.withPressure > 0 && lastComplete.count > 0,
      `last analysed season ${lastComplete?.label} has ${lastComplete?.withPressure} measured of ${lastComplete?.count}`
    )
  );
  gates.push(
    gate(
      'provisional:excluded seasons really are unanalysed',
      seasons
        .filter((s) => s.season > meta.completeThroughSeason)
        .every((s) => s.withPressure === 0),
      `${seasons.filter((s) => s.season > meta.completeThroughSeason).length} season(s) held back as provisional`
    )
  );

  // --- Coverage must RISE across the satellite era. This is the check that decides whether
  // the site's headline is real: if pressure coverage had fallen, the observed decline in
  // severe storms would be a measurement artefact rather than a signal. It rises, so the
  // decline is measured against a strengthening record, not a weakening one.
  const era = (lo, hi) => {
    const list = tropical.filter((s) => s.season >= lo && s.season <= hi);
    const measured = list.filter((s) => s.minPressure !== null);
    return { n: list.length, measured: measured.length, share: measured.length / list.length };
  };
  const early = era(1982, 1996);
  const late = era(2012, meta.completeThroughSeason);
  gates.push(
    gate(
      'headline:pressure coverage did not fall',
      late.share >= early.share,
      `coverage ${(early.share * 100).toFixed(1)}% (1982-96) -> ${(late.share * 100).toFixed(1)}% (2012-${meta.completeThroughSeason})`
    )
  );

  // --- Crossings must be assignable. If the locator silently returns null for most landfalls
  // the coast leaderboard is built on a handful of storms and still looks plausible.
  const crossed = storms.filter((s) => s.crossedCoast);
  const assigned = crossed.filter((s) => s.landfallState);
  gates.push(
    gate(
      'coast:crossings assigned to a state',
      crossed.length > 0 && assigned.length / crossed.length >= 0.9,
      `${assigned.length} of ${crossed.length} crossings located (${((100 * assigned.length) / crossed.length).toFixed(1)}%)`
    )
  );
  const stateTotal = Object.values(byState).reduce((sum, v) => sum + v.crossings, 0);
  gates.push(
    gate(
      'reconcile:state crossings sum to located crossings',
      stateTotal === assigned.length,
      `state table ${stateTotal} vs located ${assigned.length}`
    )
  );

  // --- Scale. A partial parse produces a site that looks complete.
  gates.push(gate('scale:storms', storms.length > 1500, `${storms.length} systems`));
  gates.push(gate('scale:points', points.length > 90_000, `${points.length} track points`));
  gates.push(
    gate('scale:seasons', seasons.length >= 120, `${seasons.length} seasons with a tropical cyclone`)
  );

  return { gates, failed: gates.filter((g) => !g.pass && !g.advisory) };
}
