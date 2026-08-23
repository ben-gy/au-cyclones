# Contributing

Thanks for your interest in this project.

## Copyright assignment is required

This project is dual-licensed: publicly under the
[GNU AGPL v3 or later](./LICENSE) with the [additional attribution
terms](./ADDITIONAL-TERMS.md), and commercially on request.

Dual licensing only remains possible if a single party holds the rights to the
whole codebase. **By submitting a pull request you assign copyright in your
contribution to Ben Richardson**, and confirm that:

1. the contribution is your own original work, or you have the right to submit it;
2. you are not knowingly including code under an incompatible licence;
3. you understand your contribution will be distributed under the AGPL **and**
   may be included in commercially licensed builds.

If you cannot agree to this, please open an issue describing the change instead of
sending a patch — that is genuinely useful and carries no such requirement.

## Data changes

Please do not add a data source without recording its licence in
`pipeline/sources.mjs` and in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

In particular: **do not add the Bureau of Meteorology's own cyclone CSV.** It
contains the same best tracks in a friendlier shape and it is deliberately absent.
BOM's copyright terms permit only personal or in-organisation use for content whose
page states no terms of use, and forbid supplying that content to any other person,
which is exactly what publishing this site does. `pipeline/sources.mjs` records the
reasoning and `tests/hygiene.test.ts` fails the build if a reference to it reappears.

## Running it

```bash
npm install
npm run data     # fetch IBTrACS and rebuild public/data (~113 MB download, cached)
npm test
npm run dev
```

`npm test` must pass, including the build gates asserted in `tests/data.test.ts`.
Those gates check named storms against their published central pressures, so if one
fails, check whether the upstream archive has been reanalysed before changing the
expected value.
