// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Leaflet track map. Adapted from patterns/leafletMap.ts.
//
// Four defences are baked in here and each one exists because its absence shipped a broken
// map somewhere in this fleet:
//  1. `zoomAnimation: false` — an interrupted zoom animation welds a scale() onto the tile
//     container, so the map renders exactly one level too far out while getZoom() keeps
//     reporting the truth.
//  2. The initial view is set SYNCHRONOUSLY as well as after layout. requestAnimationFrame
//     never fires in a background tab, so a map whose view is only set there shows no tiles,
//     no layers and no error to anyone who opened the page in one.
//  3. fitBounds on a zero-height container returns MAXIMUM zoom and renders one street
//     corner, silently — hence the clientHeight check.
//  4. Every polyline and marker gets bindTooltip. Leaflet-native tooltips track panes and
//     zoom correctly; the [data-tip] util does not, inside a map.
//
// Leaflet comes from npm, never a CDN.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toLatLngs } from '../data';
import { classColour } from '../palette';
import { attr, pressure, stormTitle } from '../format';
import type { Storm, Track } from '../types';

export interface TrackMapHandle {
  setStorms: (storms: Storm[]) => void;
  focus: (sid: string) => void;
  destroy: () => void;
}

export interface TrackMapOptions {
  container: HTMLElement;
  tracks: Record<string, Track>;
  boundaries: unknown;
  onSelect: (sid: string) => void;
  /** Draw genesis dots instead of full tracks — used by the genesis view. */
  mode?: 'tracks' | 'genesis' | 'landfall';
}

const AUSTRALIA_CENTRE: [number, number] = [-22, 132];

/**
 * The default viewport is BOM's area of responsibility — 90°E to 160°E, southern hemisphere —
 * not the coastline of Australia. Fitting to the coastline looks right and is wrong: storms
 * range far wider than the continent, so half of every track runs off the edge of the frame
 * with no indication that anything is missing.
 *
 * This is a viewport, not geometry: the numbers are the documented region definition that
 * `pipeline/parse.mjs` filters on, not hand-drawn coastline.
 */
const REGION_BOUNDS: [[number, number], [number, number]] = [
  [-42, 88],
  [2, 162],
];

export function createTrackMap(options: TrackMapOptions): TrackMapHandle {
  options.container.innerHTML = '<div class="map-canvas"></div>';
  const canvas = options.container.querySelector('.map-canvas') as HTMLElement;

  const map = L.map(canvas, {
    minZoom: 3,
    maxZoom: 10,
    // Keep the reader inside the region the data covers. Without this the map pans away to
    // oceans this site has no storms for, which reads as "there are no cyclones here" rather
    // than "this archive stops at 90 degrees east".
    maxBounds: [
      [-60, 60],
      [15, 190],
    ],
    maxBoundsViscosity: 0.7,
    zoomControl: true,
    // Do not hijack the page scroll on a long page; the buttons and pinch still zoom.
    scrollWheelZoom: false,
    zoomAnimation: false,
    preferCanvas: true,
  });
  map.attributionControl.setPrefix(false);

  // Set a view synchronously so the map is never in an unpositioned state, even in a tab
  // that never gets an animation frame.
  map.setView(AUSTRALIA_CENTRE, 3);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO · Tracks: IBTrACS v04r01 (NOAA NCEI), Australian-region analysis by the Bureau of Meteorology',
    subdomains: 'abcd',
    minZoom: 2,
    maxZoom: 10,
  }).addTo(map);

  L.geoJSON(options.boundaries as never, {
    attribution: 'Boundaries: ABS ASGS (CC BY 4.0)',
    interactive: false,
    style: () => ({
      fillColor: '#e4ded1',
      fillOpacity: 0.55,
      color: '#b3a993',
      weight: 0.7,
    }),
  }).addTo(map);

  // The archive stops dead at 90°E and 160°E, so tracks are sliced off along two invisible
  // vertical lines. Left undrawn that reads as a real feature of the weather — a wall storms
  // do not cross — rather than the edge of the Bureau's area of responsibility. Drawing the
  // boundary explicitly turns a rendering artefact into information.
  L.rectangle(
    [
      [-90, 90],
      [0, 160],
    ],
    {
      fill: false,
      color: '#0d6e8c',
      weight: 1.2,
      dashArray: '6 5',
      opacity: 0.55,
      interactive: true,
    }
  )
    .bindTooltip(
      'Australian region — 90°E to 160°E, south of the equator.\nThe area the Bureau of Meteorology issues cyclone warnings for. Tracks are cut off at these lines because the archive stops here, not because storms do.',
      { sticky: true, opacity: 0.95, className: 'map-tip' }
    )
    .addTo(map);

  const layer = L.layerGroup().addTo(map);
  const bySid = new Map<string, L.Path>();

  const tooltipFor = (storm: Storm): string => {
    const lines = [
      stormTitle(storm.name, storm.seasonLabel),
      storm.provisional
        ? 'Positions only — this season is not yet analysed'
        : `Lowest pressure: ${pressure(storm.minPressure)}`,
      storm.crossed
        ? `Crossed the coast${storm.stateName ? ` — ${storm.stateName}` : ''}`
        : 'Did not cross the coast',
    ];
    return lines.join('\n');
  };

  const draw = (storms: Storm[]) => {
    layer.clearLayers();
    bySid.clear();

    for (const storm of storms) {
      const colour = storm.provisional ? '#9aa6ab' : classColour(storm.cls);

      if (options.mode === 'genesis' || options.mode === 'landfall') {
        const lat = options.mode === 'genesis' ? storm.genLat : storm.lfLat;
        const lon = options.mode === 'genesis' ? storm.genLon : storm.lfLon;
        if (lat === null || lon === null) continue;
        const marker = L.circleMarker([lat, lon], {
          radius: storm.severe ? 5 : 3.5,
          color: colour,
          weight: 1,
          fillColor: colour,
          fillOpacity: 0.7,
        });
        marker.bindTooltip(tooltipFor(storm), { direction: 'top', opacity: 0.95, className: 'map-tip' });
        marker.on('click', () => options.onSelect(storm.sid));
        marker.addTo(layer);
        bySid.set(storm.sid, marker);
        continue;
      }

      const latLngs = toLatLngs(options.tracks[storm.sid]);
      if (latLngs.length < 2) continue;
      const line = L.polyline(latLngs, {
        color: colour,
        weight: storm.severe ? 2.1 : 1.3,
        opacity: storm.provisional ? 0.5 : 0.78,
        // A fat invisible hit area: a 1.3px line is essentially untappable on a phone.
        bubblingMouseEvents: false,
      });
      line.bindTooltip(tooltipFor(storm), { sticky: true, opacity: 0.95, className: 'map-tip' });
      line.on('click', () => options.onSelect(storm.sid));
      line.on('mouseover', () => line.setStyle({ weight: (storm.severe ? 2.1 : 1.3) + 2.4, opacity: 1 }));
      line.on('mouseout', () => line.setStyle({ weight: storm.severe ? 2.1 : 1.3, opacity: storm.provisional ? 0.5 : 0.78 }));
      line.addTo(layer);
      bySid.set(storm.sid, line);
    }
  };

  // Zero-size defence: fit once the container actually has height, and again on a timer in
  // case the ResizeObserver never fires (a background tab, or a display:none ancestor).
  const fit = () => {
    map.invalidateSize();
    if (canvas.clientHeight <= 50) return;
    map.fitBounds(REGION_BOUNDS, { padding: [8, 8] });
  };
  const observer = new ResizeObserver(() => {
    if (canvas.clientHeight > 50) {
      fit();
      observer.disconnect();
    }
  });
  observer.observe(canvas);
  setTimeout(fit, 350);

  return {
    setStorms: draw,
    focus: (sid: string) => {
      const shape = bySid.get(sid);
      if (!shape) return;
      const bounds = 'getBounds' in shape ? (shape as L.Polyline).getBounds() : null;
      if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
      else if ('getLatLng' in shape) map.setView((shape as L.CircleMarker).getLatLng(), 6);
      (shape as L.Polyline).setStyle?.({ weight: 4, opacity: 1 });
    },
    destroy: () => {
      observer.disconnect();
      map.remove();
    },
  };
}

/** Tooltip text for a state polygon, escaped for an attribute. */
export function stateTip(name: string, crossings: number): string {
  return attr(`${name}\n${crossings} recorded coast crossings`);
}

export { AUSTRALIA_CENTRE };
