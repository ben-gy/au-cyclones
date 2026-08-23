// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Assigning a coast crossing to a place, using real ABS boundary geometry.
//
// A landfall point is where IBTrACS says the system's NEXT position is over land, so the
// point itself is usually still just offshore. Point-in-polygon alone therefore misses most
// crossings, and a bounding-box test would put a Gulf of Carpentaria crossing in Western
// Australia. We test containment first and fall back to the nearest polygon vertex, which is
// correct for a point that is by construction within one time step of the coast.
//
// No coordinates are authored here. The geometry comes from the factory's ABS-derived
// patterns/geo/au-states.geojson.

/** Ray casting against one linear ring. */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** A GeoJSON Polygon is [outerRing, ...holes]. */
function pointInPolygon(lon, lat, rings) {
  if (!rings.length || !pointInRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) if (pointInRing(lon, lat, rings[i])) return false;
  return true;
}

function eachPolygon(geometry, visit) {
  if (!geometry) return;
  if (geometry.type === 'Polygon') visit(geometry.coordinates);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(visit);
}

/**
 * Great-circle distance in kilometres. Squared-degree distance would systematically prefer
 * high-latitude polygons, because a degree of longitude is 111 km at the equator and 78 km
 * at 45 degrees south — enough to hand Tasmania crossings that belong to Victoria.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Build a lookup that maps a lat/lon to a state code.
 * @param {object} geojson ABS state boundaries, features with properties {code, name}
 */
export function buildStateLocator(geojson) {
  const states = geojson.features.map((feature) => {
    const polygons = [];
    eachPolygon(feature.geometry, (rings) => polygons.push(rings));
    return {
      code: feature.properties.code,
      name: feature.properties.name,
      polygons,
    };
  });

  /**
   * @param {number} lat
   * @param {number} lon
   * @param {number} maxKm give up beyond this distance rather than assigning an ocean point
   *        in the middle of the Indian Ocean to Western Australia
   * @returns {{code: string, name: string, distanceKm: number}|null}
   */
  return function locate(lat, lon, maxKm = 400) {
    for (const state of states) {
      for (const rings of state.polygons) {
        if (pointInPolygon(lon, lat, rings)) {
          return { code: state.code, name: state.name, distanceKm: 0 };
        }
      }
    }

    let best = null;
    for (const state of states) {
      for (const rings of state.polygons) {
        for (const ring of rings) {
          for (const [rlon, rlat] of ring) {
            const d = haversineKm(lat, lon, rlat, rlon);
            if (best === null || d < best.distanceKm) {
              best = { code: state.code, name: state.name, distanceKm: d };
            }
          }
        }
      }
    }
    return best && best.distanceKm <= maxKm ? best : null;
  };
}

export const _test = { pointInRing, pointInPolygon };
