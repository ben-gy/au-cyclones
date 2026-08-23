# Third-party notices

Derived from the shipped bundle's sourcemap (`dist/assets/*.js.map`), which records what
actually reaches the browser, rather than from `npm ls`, which lists build-time tooling
that is never served.

## Code bundled into the site

### Leaflet 1.9.4 — BSD-2-Clause

Interactive map rendering. <https://leafletjs.com/>

```
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Fonts

None are bundled. The site uses a system font stack only, so no font licence applies.

## Services loaded at runtime

- **CARTO basemap tiles** — © CARTO, © OpenStreetMap contributors. Tiles are fetched by
  the visitor's browser and are not redistributed by this repository.
- **Cloudflare Web Analytics** — cookie-less, anonymous page-view counts.
- **Feedback widget** — hosted at feedback.benrichardson.dev.

## Data (NOT covered by this repository's code licence)

See [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md) for the full attribution text.

### Tropical cyclone best tracks — IBTrACS v04r01

NOAA National Centers for Environmental Information. Open under the World Data Center for
Meteorology policy and WMO Resolution 40; NCEI states it holds agreements from the
Regional Specialised Meteorological Centres that supply the track data allowing open
distribution. Citation is required — both the dataset and the BAMS paper. The
Australian-region analysis originates with the Australian Bureau of Meteorology as the
RSMC for the Australian region.

### State and territory boundaries — ABS ASGS

Australian Bureau of Statistics, used under Creative Commons Attribution 4.0
International (CC BY 4.0).

### Deliberately not used — the Bureau of Meteorology's own cyclone CSV

BOM publishes the same best tracks directly. This project does not fetch or
redistribute that file. BOM's copyright terms allow only personal or in-organisation use
where a page states no terms of use — as the cyclone database page does — and state that
you "must not supply it to any other person". Publishing a website does exactly that.
The route used here instead is NOAA's IBTrACS archive.
