// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Boot, shell, routing.
//
// The feedback widget is NOT imported here. It is the hosted script in index.html, which
// self-mounts onto .site-footer .footer-inner on DOMContentLoaded.

import './styles.css';
import { loadBundle, searchStorms, type Bundle } from './data';
import { VIEWS, buildHash, parseHash } from './router';
import { initTooltip } from './components/tooltip';
import { el, errorBox, initGlossary } from './components/ui';
import { closeOverlay, isOverlayOpen } from './overlay';
import { openDossier } from './components/dossier';
import { openAbout } from './about';
import { destroyAtlas, focusOnMap, renderAtlas, type ViewContext } from './views/atlas';
import { renderSeasons } from './views/seasons';
import { destroyCoast, renderCoast } from './views/coast';
import { renderRecords } from './views/records';
import { renderAnatomy } from './views/anatomy';
import { renderRecord } from './views/record';
import { esc, num, pressure, stormTitle } from './format';

const STORAGE_KEY = 'au-cyclones:view';

const app = document.getElementById('app') as HTMLElement;
let bundle: Bundle | null = null;
let currentView = '';

function shell(): { main: HTMLElement } {
  app.innerHTML = '';

  const header = el('header', 'site-header');
  const inner = el('div', 'header-inner');

  const brand = el('div', 'brand');
  brand.append(el('span', 'brand-name', 'Cyclone Tracks'));
  brand.append(el('span', 'brand-sub', 'Australian region · 1880 to today'));
  inner.append(brand);

  // Search
  const searchWrap = el('div', 'search-wrap');
  searchWrap.innerHTML = '<span class="search-icon" aria-hidden="true">⌕</span>';
  const search = el('input', 'search-input');
  search.type = 'search';
  search.placeholder = 'Find a storm by name…';
  search.setAttribute('aria-label', 'Find a cyclone by name');
  searchWrap.append(search);
  const results = el('div', 'search-results');
  results.hidden = true;
  searchWrap.append(results);
  inner.append(searchWrap);

  inner.append(el('div', 'header-spacer'));

  const tabs = el('nav', 'tabs');
  tabs.setAttribute('aria-label', 'Views');
  for (const view of VIEWS) {
    const tab = el('button', 'tab', esc(view.label));
    tab.type = 'button';
    tab.dataset.view = view.id;
    tab.setAttribute('data-tip', view.blurb);
    tab.addEventListener('click', () => go(view.id));
    tabs.append(tab);
  }
  inner.append(tabs);

  const about = el('button', 'icon-button', '?');
  about.type = 'button';
  about.setAttribute('aria-label', 'About this site');
  about.setAttribute('data-tip', 'What this is, where the data comes from, and what it cannot tell you');
  about.addEventListener('click', () => {
    if (bundle) openAbout(bundle.meta);
  });
  inner.append(about);

  header.append(inner);
  app.append(header);

  const main = el('main', 'main-content');
  app.append(main);

  const footer = el('footer', 'site-footer');
  const footerInner = el('div', 'footer-inner');
  const sourceNote = el('div', 'footer-source');
  sourceNote.innerHTML =
    'Tracks: <strong>IBTrACS v04r01</strong>, NOAA National Centers for Environmental Information. ' +
    'Australian-region analysis by the Bureau of Meteorology as the responsible warning centre. ' +
    'Boundaries: ABS ASGS (CC BY 4.0). This is a historical archive, not a warning service — ' +
    'during a cyclone, follow the Bureau of Meteorology.';
  footerInner.append(sourceNote);
  const credit = el('div');
  credit.innerHTML =
    'Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> · ' +
    '<a href="https://lab.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a>';
  footerInner.append(credit);
  footer.append(footerInner);
  app.append(footer);

  // --- Search behaviour ---------------------------------------------------------------
  let debounce: number | undefined;
  const runSearch = () => {
    if (!bundle) return;
    const matches = searchStorms(bundle.storms, search.value);
    results.innerHTML = '';
    if (!matches.length) {
      results.hidden = true;
      return;
    }
    for (const storm of matches) {
      const button = el('button', 'search-result');
      button.type = 'button';
      button.innerHTML = `<span class="search-result-name">${esc(stormTitle(storm.name, storm.seasonLabel))}</span><span class="search-result-meta">${esc(pressure(storm.minPressure))}</span>`;
      button.addEventListener('click', () => {
        results.hidden = true;
        search.value = '';
        openStorm(storm.sid);
      });
      results.append(button);
    }
    results.hidden = false;
  };
  search.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(runSearch, 300);
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      search.value = '';
      results.hidden = true;
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!searchWrap.contains(event.target as Node)) results.hidden = true;
  });

  return { main };
}

function markActiveTab(view: string): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function go(view: string): void {
  const route = parseHash(window.location.hash);
  window.location.hash = buildHash({ view, storm: route.storm });
}

function openStorm(sid: string): void {
  const route = parseHash(window.location.hash);
  window.location.hash = buildHash({ view: route.view, storm: sid });
}

function renderView(view: string, main: HTMLElement): void {
  if (!bundle) return;

  // Tear down anything holding a Leaflet instance before replacing the DOM it lives in,
  // or the map keeps listeners on a detached node and leaks on every navigation.
  destroyAtlas();
  destroyCoast();

  main.innerHTML = '';
  main.scrollTop = 0;
  currentView = view;
  markActiveTab(view);

  const definition = VIEWS.find((v) => v.id === view);
  document.title = definition && view !== 'atlas' ? `${definition.label} · Cyclone Tracks` : 'Cyclone Tracks';

  const ctx: ViewContext = { bundle, openStorm, goTo: go };

  try {
    if (view === 'atlas') renderAtlas(main, ctx);
    else if (view === 'seasons') renderSeasons(main, ctx);
    else if (view === 'coast') renderCoast(main, ctx);
    else if (view === 'records') renderRecords(main, ctx);
    else if (view === 'anatomy') renderAnatomy(main, ctx);
    else if (view === 'record') renderRecord(main, ctx);
  } catch {
    main.append(errorBox('Something went wrong drawing this view.', () => renderView(view, main)));
  }

  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Private browsing denies localStorage; the site works without a remembered view.
  }
}

async function boot(): Promise<void> {
  const { main } = shell();
  main.append(el('div', 'loading', 'Loading the cyclone archive…'));

  initTooltip();
  initGlossary();

  try {
    bundle = await loadBundle();
  } catch {
    main.innerHTML = '';
    main.append(
      errorBox('Could not load the cyclone archive. Check your connection and try again.', () => {
        void boot();
      })
    );
    return;
  }

  let lastStorm: string | null = null;

  const apply = () => {
    if (!bundle) return;
    const route = parseHash(window.location.hash);
    if (route.view !== currentView) renderView(route.view, main);

    if (route.storm !== lastStorm) {
      lastStorm = route.storm;
      if (route.storm) {
        const storm = bundle.byId.get(route.storm);
        if (storm) {
          focusOnMap(storm.sid);
          openDossier(storm, bundle.meta, () => {
            // Closing the drawer clears the storm from the URL without adding a history entry
            // the user would have to press Back through twice.
            const now = parseHash(window.location.hash);
            if (now.storm) window.location.replace(buildHash({ view: now.view, storm: null }));
          });
        }
      } else if (isOverlayOpen()) {
        closeOverlay();
      }
    }
  };

  window.addEventListener('hashchange', apply);

  if (!window.location.hash) {
    let remembered = VIEWS[0].id;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && VIEWS.some((v) => v.id === stored)) remembered = stored;
    } catch {
      // ignore
    }
    window.location.replace(buildHash({ view: remembered, storm: null }));
  }
  apply();

  // If the hash was already the remembered view, `apply` above may not have drawn anything.
  if (!currentView) renderView(parseHash(window.location.hash).view, main);

  const counts = bundle.meta.counts;
  const description = `${num(counts.systems)} tracked systems, ${num(counts.points)} positions, ${num(counts.distinctNames)} named storms.`;
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    `Every tropical cyclone tracked in the Australian region since ${bundle.meta.firstSeasonLabel}. ${description}`
  );
}

void boot();
