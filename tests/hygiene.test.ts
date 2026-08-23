// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Source-level rules that are invisible in jsdom and expensive to discover in production.
// Every one of these encodes a defect that has actually shipped somewhere in this fleet.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (entry === 'cache' || entry === 'node_modules') continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const CSS = read('src/styles.css');
const HTML = read('index.html');
const SOURCES = [...walk('src'), ...walk('pipeline').filter((f) => f.endsWith('.mjs'))];

/** These scanners must read CODE, not the comments explaining the code. Several rules below
 *  are documented in a comment that necessarily quotes the banned construct, and a naive scan
 *  then flags its own explanation. Strip comments first — fix the scanner, never delete the
 *  explanation. */
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJsComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const CSS_CODE = stripCssComments(CSS);

describe('the [hidden] guard', () => {
  it('is present, uses !important, and comes before any component rule', () => {
    // An author rule like `.overlay-panel{display:flex}` outranks the UA stylesheet's
    // `[hidden]{display:none}` regardless of specificity. Without this line, an element
    // hidden by attribute renders from first paint and `el.hidden = true` does nothing —
    // which shipped a modal that could not be dismissed by ✕, scrim OR Escape.
    expect(CSS).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
    const guardAt = CSS.indexOf('[hidden]');
    const firstDisplayRule = CSS.search(/\.[a-z-]+[^{]*\{[^}]*display:/);
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeLessThan(firstDisplayRule);
  });
});

describe('the tooltip needs both of its rules', () => {
  it('defines .hover-tip AND .hover-tip.visible', () => {
    // initTooltip shows and hides purely by toggling `visible`. Without the .visible rule the
    // tooltip is painted on first hover and never hidden again — it simply follows the
    // pointer around the page, and no handler test can see it.
    expect(CSS).toMatch(/\.hover-tip\s*\{/);
    expect(CSS).toMatch(/\.hover-tip\.visible\s*\{[^}]*opacity:\s*1/);
  });
});

describe('scroll and sticky traps', () => {
  it('uses overflow-x: clip rather than hidden on the page root', () => {
    // overflow-x: hidden makes the nearest ancestor a scroll container and silently kills
    // position: sticky on the header.
    expect(CSS_CODE).not.toMatch(/overflow-x:\s*hidden/);
    expect(CSS_CODE).toMatch(/overflow-x:\s*clip/);
  });

  it('keeps the sticky header below the overlay layer', () => {
    const header = Number(/--z-header:\s*(\d+)/.exec(CSS)?.[1]);
    const scrim = Number(/--z-scrim:\s*(\d+)/.exec(CSS)?.[1]);
    const panel = Number(/--z-panel:\s*(\d+)/.exec(CSS)?.[1]);
    expect(header).toBeLessThan(scrim);
    expect(scrim).toBeLessThan(panel);
  });

  it('puts every overlay layer above Leaflet, which reaches z-index 1000', () => {
    for (const name of ['--z-scrim', '--z-panel', '--z-tooltip', '--z-popover']) {
      const value = Number(new RegExp(`${name}:\\s*(\\d+)`).exec(CSS)?.[1]);
      expect(value, `${name} must clear Leaflet's 1000`).toBeGreaterThan(1000);
    }
  });

  it('isolates the map container so Leaflet panes cannot escape to the page root', () => {
    // Without a stacking context, Leaflet's own z-indexed children paint OVER modals — which
    // shipped an About panel rendering underneath a map.
    const frame = /\.map-frame\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(frame).toMatch(/isolation:\s*isolate/);
    expect(frame).toMatch(/z-index:\s*0/);
    expect(frame).toMatch(/position:\s*relative/);
  });

  it('does not make a table head sticky inside a horizontal scrollport', () => {
    // `overflow-x: auto` on the wrapper captures `position: sticky` on the thead and parks it
    // mid-table instead of at the top of the viewport.
    const wrap = /\.table-wrap\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(wrap).toMatch(/overflow-x:\s*auto/);
    expect(CSS_CODE).not.toMatch(/\.data-table thead th\s*\{[^}]*position:\s*sticky/);
  });
});

describe('mobile overflow rules', () => {
  it('gives truncating grid children min-width: 0', () => {
    // A nowrap child refuses to shrink below its content width and forces the whole page to
    // scroll sideways. This is the commonest cause of mobile overflow.
    const label = /\.bar-label\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('never sizes an auto-fit or auto-fill grid with a bare 1fr minimum', () => {
    // `1fr` is `minmax(auto, 1fr)`, and the auto minimum reintroduces the blowout.
    const bare = CSS.match(/repeat\(auto-(?:fit|fill),\s*minmax\((?!min\(|0)/g) ?? [];
    expect(bare, `found un-clamped auto tracks: ${bare.join(', ')}`).toHaveLength(0);
  });

  it('scrolls wide content inside its own container', () => {
    expect(/\.x-scroll\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '').toMatch(/overflow-x:\s*auto/);
    for (const selector of ['.chart', '.matrix', '.scatter', '.data-table']) {
      expect(
        CSS_CODE,
        `${selector} is wide by nature and needs a min-width so its own scroller engages`
      ).toMatch(new RegExp(`\\${selector}\\s*\\{[^}]*min-width:`));
    }
  });

  it('lets the truncating cells in the detail list shrink', () => {
    expect(/\.detail-meta\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '').toMatch(/minmax\(min\(/);
    expect(/\.link-button\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '').toMatch(/min-width:\s*0/);
    expect(/\.detail-item\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '').toMatch(/min-width:\s*0/);
  });
});

describe('styling must never corrupt a unit', () => {
  it('does not uppercase a table header that carries a unit', () => {
    // `text-transform: uppercase` turns "hPa" into "HPA" and, elsewhere in this fleet, turned
    // micrometres into millimetres — a factor of a thousand introduced by CSS alone.
    const head = /\.data-table thead th\s*\{([^}]*)\}/.exec(CSS_CODE)?.[1] ?? '';
    expect(head).not.toMatch(/text-transform:\s*uppercase/);
  });
});

describe('the bar fill must be a block', () => {
  it('gives .bar-fill display: block', () => {
    // A width percentage on a bare inline <span> renders nothing at all — inline boxes ignore
    // width — so the view looks empty.
    expect(/\.bar-fill\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '').toMatch(/display:\s*block/);
  });
});

describe('required third-party integrations', () => {
  it('ships the Cloudflare analytics beacon', () => {
    expect(HTML).toContain('static.cloudflareinsights.com/beacon.min.js');
  });

  it('ships the hosted feedback widget and does NOT vendor a local copy', () => {
    expect(HTML).toContain('https://feedback.benrichardson.dev/w.js');
    expect(SOURCES).not.toContain('src/feedback.ts');
    for (const file of SOURCES) expect(read(file)).not.toMatch(/mountFeedback/);
  });

  it('has no canonical link, which would trip source hygiene', () => {
    expect(HTML).not.toMatch(/rel=["']canonical["']/);
  });

  it('renders a footer container the hosted widget can mount into', () => {
    // The hosted script appends its trigger to `.site-footer .footer-inner`. Rename either
    // class and the widget silently vanishes.
    const main = read('src/main.ts');
    expect(main).toMatch(/'site-footer'/);
    expect(main).toMatch(/'footer-inner'/);
  });
});

describe('the site must not look like a repository', () => {
  it('links to no GitHub repository anywhere in the UI', () => {
    for (const file of SOURCES) {
      expect(read(file), `${file} links to GitHub`).not.toMatch(/https:\/\/github\.com\//);
    }
    expect(HTML).not.toMatch(/https:\/\/github\.com\//);
  });

  it('carries the required attribution and the directory backlink in the footer', () => {
    const main = read('src/main.ts');
    expect(main).toContain('https://benrichardson.dev/');
    expect(main).toContain('https://lab.benrichardson.dev');
  });

  it('keeps code-licence copy out of the interface', () => {
    // Data attribution is required and stays; code-licence copy belongs in the repo only.
    // The SPDX header itself names AGPL, so scan the code rather than the comments.
    for (const file of SOURCES.filter((f) => f.startsWith('src/') && !f.endsWith('.css'))) {
      expect(stripJsComments(read(file)), `${file} puts code-licence copy in the UI`).not.toMatch(
        /AGPL|GNU Affero/
      );
    }
  });

  it('keeps the DATA attribution visibly in the interface', () => {
    // Citation is a condition of use for IBTrACS. It must survive any future edit.
    const main = read('src/main.ts');
    expect(main).toMatch(/IBTrACS/);
    expect(main).toMatch(/NOAA/);
    expect(main).toMatch(/Bureau of Meteorology/);
    expect(main).toMatch(/ABS ASGS \(CC BY 4\.0\)/);
  });

  it('says plainly that this is not a warning service', () => {
    // A hazard site that could be mistaken for a live warning feed is a safety problem, not a
    // copy problem.
    const main = read('src/main.ts');
    expect(main).toMatch(/not a warning service/i);
  });
});

describe('the Bureau of Meteorology file must never be fetched', () => {
  it('appears in no source file as a URL', () => {
    // BOM's terms permit personal or in-organisation use only where a page states no terms,
    // and forbid supplying the content to any other person. Publishing it here would breach
    // that. Adding it "as a fallback" is the same act. The route is IBTrACS.
    // Scan CODE only. Naming the file in a comment that explains why it is banned is exactly
    // what should happen; naming it in a fetch is the defect.
    for (const file of SOURCES) {
      const body = stripJsComments(read(file));
      expect(body, `${file} references the BOM cyclone CSV`).not.toMatch(/IDCKMSTM0S/);
      expect(body, `${file} fetches from bom.gov.au`).not.toMatch(/https?:\/\/(www\.)?bom\.gov\.au/);
    }
  });

  it('states in the source why, so the next author does not re-add it', () => {
    const sources = read('pipeline/sources.mjs');
    expect(sources).toMatch(/must not supply it to any other person/i);
  });
});

describe('navigation tabs are words only', () => {
  it('has no numeric count in any nav label', () => {
    const router = read('src/router.ts');
    const labels = [...router.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(4);
    for (const label of labels) {
      expect(label, `nav label "${label}" contains a count`).not.toMatch(/\d/);
    }
  });

  it('ships at least five distinct views', () => {
    const router = read('src/router.ts');
    const ids = [...router.matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('geometry provenance', () => {
  it('ships a real boundary file, not hand-authored coordinates', () => {
    const size = statSync(join(ROOT, 'public/data/au-states.geojson')).size;
    expect(size).toBeGreaterThan(50_000);
  });

  it('has no hand-written coordinate arrays in the source', () => {
    for (const file of SOURCES.filter((f) => f.startsWith('src/'))) {
      expect(
        read(file),
        `${file} looks like it contains hand-authored geometry`
      ).not.toMatch(/\[\s*-?1[0-5]\d\.\d+\s*,\s*-[1-4]\d\.\d+\s*\]\s*,\s*\[\s*-?1[0-5]\d\.\d+/);
    }
  });
});

describe('the map must not animate its zoom', () => {
  const map = read('src/components/trackMap.ts');

  it('sets zoomAnimation: false', () => {
    // An interrupted zoom animation welds a scale() onto the tile container and the map
    // renders exactly one level too far out, silently, with getZoom() still truthful.
    expect(map).toMatch(/zoomAnimation:\s*false/);
  });

  it('loads Leaflet from npm rather than a CDN', () => {
    expect(map).toMatch(/^import L from 'leaflet';/m);
    expect(map).not.toMatch(/unpkg\.com\/leaflet|cdn\.jsdelivr\.net\/npm\/leaflet/);
  });

  it('defends against fitting a zero-height container', () => {
    // fitBounds on a 0x0 box returns MAXIMUM zoom and renders one street corner, silently.
    expect(map).toMatch(/clientHeight\s*<=\s*50|clientHeight\s*>\s*50/);
    expect(map).toContain('invalidateSize');
  });

  it('sets a view synchronously, not only inside requestAnimationFrame', () => {
    // rAF never fires in a background tab, so a map whose view is set only there shows no
    // tiles, no layers and no error to anyone who opened the page in one.
    const body = stripJsComments(map);
    expect(body).toMatch(/map\.setView\(AUSTRALIA_CENTRE,\s*\d+\);/);
    expect(body).toContain('setTimeout');
  });

  it('gives every polyline and marker a bound tooltip', () => {
    expect((map.match(/bindTooltip/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('does not hijack the page scroll', () => {
    expect(map).toMatch(/scrollWheelZoom:\s*false/);
  });
});

describe('SPDX headers', () => {
  it('is on every first-party source file', () => {
    for (const file of SOURCES) {
      if (file.endsWith('.css')) continue;
      expect(read(file).slice(0, 220), `${file} has no SPDX header`).toMatch(/SPDX-License-Identifier/);
    }
    expect(CSS.slice(0, 220)).toMatch(/SPDX-License-Identifier/);
  });
});

describe('no debug output ships', () => {
  it('has no console.log or console.error in src/', () => {
    for (const file of SOURCES.filter((f) => f.startsWith('src/') && f.endsWith('.ts'))) {
      expect(read(file), `${file} logs to the console`).not.toMatch(/console\.(log|error|warn|debug)\(/);
    }
  });
});

describe('every fetch is guarded', () => {
  it('handles a failed response rather than parsing an error page as JSON', () => {
    const data = read('src/data.ts');
    expect(data).toMatch(/if\s*\(!response\.ok\)\s*throw/);
  });

  it('shows the reader a retry when the archive cannot be loaded', () => {
    expect(read('src/main.ts')).toMatch(/errorBox\(/);
  });
});
