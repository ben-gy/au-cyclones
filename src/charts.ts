// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Hand-rolled SVG chart primitives. No chart library: these are bar series, a scatter, a
// matrix and a rose, and every one of them is a few dozen lines of geometry that a library
// would cost 90 KB to provide.
//
// House rules enforced here:
//  - every mark carries a [data-tip] with its exact value;
//  - no mark is ever drawn at a NaN coordinate (a NaN in an SVG path silently voids the
//    whole path, so a single bad datum blanks the entire chart);
//  - a null value is drawn as a gap or an explicit "not recorded" mark, never as zero.

import { attr, esc } from './format';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(width: number, height: number, className: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', `0 0 ${width} ${height}`);
  node.setAttribute('width', String(width));
  node.setAttribute('height', String(height));
  node.setAttribute('class', className);
  node.setAttribute('role', 'img');
  return node;
}

export function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

/** Guard every coordinate that reaches the DOM. */
export function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export interface BarDatum {
  label: string;
  value: number;
  colour: string;
  tip: string;
  onClick?: () => void;
}

/**
 * Vertical bar series with a y axis, used for the per-season counts.
 * `overlay` draws a second series (e.g. severe storms) inside the first.
 */
export function barSeries(
  data: BarDatum[],
  options: {
    width?: number;
    height?: number;
    overlay?: { values: number[]; colour: string; label: string };
    trendLine?: { from: number; to: number } | null;
    yLabel?: string;
    tickEvery?: number;
  } = {}
): SVGSVGElement {
  const width = options.width ?? 1080;
  const height = options.height ?? 300;
  const pad = { top: 14, right: 12, bottom: 30, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = plotW / Math.max(1, data.length);
  const barW = Math.max(1, step * 0.78);

  const root = svg(width, height, 'chart');
  const x = (i: number) => pad.left + i * step + (step - barW) / 2;
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  // Grid and y ticks
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const value = (max / ticks) * i;
    const yy = finite(y(value));
    root.append(node('line', { x1: pad.left, y1: yy, x2: width - pad.right, y2: yy, class: 'grid-line' }));
    const tick = node('text', { x: pad.left - 6, y: yy + 3, 'text-anchor': 'end', class: 'axis-label' });
    tick.textContent = String(Math.round(value));
    root.append(tick);
  }

  for (const [i, datum] of data.entries()) {
    const h = Math.max(0, plotH - (y(datum.value) - pad.top));
    const rect = node('rect', {
      x: finite(x(i)),
      y: finite(y(datum.value)),
      width: barW,
      height: finite(h),
      fill: datum.colour,
      rx: 1,
      class: 'mark',
    });
    rect.setAttribute('data-tip', datum.tip);
    rect.setAttribute('aria-label', datum.tip.replace(/\n/g, '. '));
    if (datum.onClick) {
      rect.addEventListener('click', datum.onClick);
    } else {
      rect.setAttribute('class', 'mark-static');
    }
    root.append(rect);

    if (options.overlay) {
      const value = options.overlay.values[i] ?? 0;
      if (value > 0) {
        const oh = Math.max(0, plotH - (y(value) - pad.top));
        const orect = node('rect', {
          x: finite(x(i)),
          y: finite(y(value)),
          width: barW,
          height: finite(oh),
          fill: options.overlay.colour,
          rx: 1,
          class: 'mark-static',
        });
        orect.setAttribute('data-tip', datum.tip);
        root.append(orect);
      }
    }
  }

  // x ticks, thinned so labels never collide
  const every = options.tickEvery ?? Math.ceil(data.length / 14);
  for (const [i, datum] of data.entries()) {
    if (i % every) continue;
    const tick = node('text', {
      x: finite(x(i) + barW / 2),
      y: height - 10,
      'text-anchor': 'middle',
      class: 'axis-label',
    });
    tick.textContent = datum.label;
    root.append(tick);
  }

  root.append(node('line', { x1: pad.left, y1: pad.top + plotH, x2: width - pad.right, y2: pad.top + plotH, class: 'axis-line' }));

  if (options.yLabel) {
    const label = node('text', { x: 4, y: 10, class: 'axis-label' });
    label.textContent = options.yLabel;
    root.append(label);
  }
  return root;
}

/** Ordinary least squares fit drawn over an existing bar series' index axis. */
export function trendOverlay(
  root: SVGSVGElement,
  values: (number | null)[],
  colour: string,
  tipText: string,
  options: { width?: number; height?: number } = {}
): void {
  const width = options.width ?? 1080;
  const height = options.height ?? 300;
  const pad = { top: 14, right: 12, bottom: 30, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const step = plotW / Math.max(1, values.length);

  const pairs = values
    .map((v, i) => ({ i, v }))
    .filter((p): p is { i: number; v: number } => p.v !== null && Number.isFinite(p.v));
  if (pairs.length < 2) return;

  const max = Math.max(1, ...pairs.map((p) => p.v));
  const meanX = pairs.reduce((s, p) => s + p.i, 0) / pairs.length;
  const meanY = pairs.reduce((s, p) => s + p.v, 0) / pairs.length;
  let cov = 0;
  let varX = 0;
  for (const p of pairs) {
    cov += (p.i - meanX) * (p.v - meanY);
    varX += (p.i - meanX) ** 2;
  }
  if (varX === 0) return;
  const slope = cov / varX;
  const intercept = meanY - slope * meanX;

  const first = pairs[0].i;
  const last = pairs[pairs.length - 1].i;
  const px = (i: number) => pad.left + i * step + step / 2;
  const py = (v: number) => pad.top + plotH - (Math.max(0, v) / max) * plotH;

  const line = node('line', {
    x1: finite(px(first)),
    y1: finite(py(intercept + slope * first)),
    x2: finite(px(last)),
    y2: finite(py(intercept + slope * last)),
    stroke: colour,
    'stroke-width': 2,
    'stroke-dasharray': '5 3',
    class: 'mark-static',
  });
  line.setAttribute('data-tip', tipText);
  root.append(line);
}

/** A cross-reference matrix (heatmap). Every cell is hoverable and carries its exact value. */
export function matrix(
  rows: string[],
  columns: string[],
  cell: (r: number, c: number) => { value: number | null; colour: string; tip: string; label?: string },
  options: { cellW?: number; cellH?: number; labelW?: number } = {}
): SVGSVGElement {
  const cellW = options.cellW ?? 64;
  const cellH = options.cellH ?? 30;
  const labelW = options.labelW ?? 118;
  const headH = 26;
  const width = labelW + columns.length * cellW + 8;
  const height = headH + rows.length * cellH + 8;
  const root = svg(width, height, 'matrix');

  for (const [c, column] of columns.entries()) {
    const text = node('text', {
      x: labelW + c * cellW + cellW / 2,
      y: headH - 8,
      'text-anchor': 'middle',
      class: 'axis-label',
    });
    text.textContent = column;
    root.append(text);
  }

  for (const [r, row] of rows.entries()) {
    const text = node('text', { x: labelW - 8, y: headH + r * cellH + cellH / 2 + 4, 'text-anchor': 'end', class: 'series-label' });
    text.textContent = row;
    root.append(text);

    for (let c = 0; c < columns.length; c += 1) {
      const data = cell(r, c);
      const rect = node('rect', {
        x: labelW + c * cellW + 1,
        y: headH + r * cellH + 1,
        width: cellW - 2,
        height: cellH - 2,
        fill: data.colour,
        rx: 2,
        class: 'mark-static',
      });
      rect.setAttribute('data-tip', data.tip);
      rect.setAttribute('aria-label', data.tip.replace(/\n/g, '. '));
      root.append(rect);

      if (data.label) {
        const label = node('text', {
          x: labelW + c * cellW + cellW / 2,
          y: headH + r * cellH + cellH / 2 + 4,
          'text-anchor': 'middle',
          class: 'axis-label',
          fill: data.value !== null && data.value > 55 ? '#ffffff' : 'currentColor',
        });
        label.textContent = data.label;
        label.setAttribute('pointer-events', 'none');
        root.append(label);
      }
    }
  }
  return root;
}

export interface ScatterPoint {
  x: number;
  y: number;
  r: number;
  colour: string;
  tip: string;
  onClick?: () => void;
}

/** Scatter with linear axes. Used for size against strength. */
export function scatter(
  points: ScatterPoint[],
  options: {
    width?: number;
    height?: number;
    xLabel: string;
    yLabel: string;
    xDomain?: [number, number];
    yDomain?: [number, number];
    /** Invert y so that "lower pressure = stronger" reads upward. */
    invertY?: boolean;
  }
): SVGSVGElement {
  const width = options.width ?? 780;
  const height = options.height ?? 380;
  const pad = { top: 16, right: 16, bottom: 40, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = options.xDomain ?? [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = options.yDomain ?? [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => pad.left + ((v - x0) / Math.max(1e-9, x1 - x0)) * plotW;
  const sy = (v: number) => {
    const t = (v - y0) / Math.max(1e-9, y1 - y0);
    return pad.top + (options.invertY ? t : 1 - t) * plotH;
  };

  const root = svg(width, height, 'scatter');

  for (let i = 0; i <= 4; i += 1) {
    const value = y0 + ((y1 - y0) / 4) * i;
    const yy = finite(sy(value));
    root.append(node('line', { x1: pad.left, y1: yy, x2: width - pad.right, y2: yy, class: 'grid-line' }));
    const label = node('text', { x: pad.left - 6, y: yy + 3, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = String(Math.round(value));
    root.append(label);
  }
  for (let i = 0; i <= 4; i += 1) {
    const value = x0 + ((x1 - x0) / 4) * i;
    const xx = finite(sx(value));
    const label = node('text', { x: xx, y: height - 22, 'text-anchor': 'middle', class: 'axis-label' });
    label.textContent = String(Math.round(value));
    root.append(label);
  }

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const circle = node('circle', {
      cx: finite(sx(point.x)),
      cy: finite(sy(point.y)),
      r: point.r,
      fill: point.colour,
      'fill-opacity': 0.72,
      stroke: point.colour,
      'stroke-width': 0.6,
      class: point.onClick ? 'mark' : 'mark-static',
    });
    circle.setAttribute('data-tip', point.tip);
    circle.setAttribute('aria-label', point.tip.replace(/\n/g, '. '));
    if (point.onClick) circle.addEventListener('click', point.onClick);
    root.append(circle);
  }

  root.append(node('line', { x1: pad.left, y1: pad.top + plotH, x2: width - pad.right, y2: pad.top + plotH, class: 'axis-line' }));
  root.append(node('line', { x1: pad.left, y1: pad.top, x2: pad.left, y2: pad.top + plotH, class: 'axis-line' }));

  const xLabel = node('text', { x: pad.left + plotW / 2, y: height - 6, 'text-anchor': 'middle', class: 'axis-label' });
  xLabel.textContent = options.xLabel;
  root.append(xLabel);
  const yLabel = node('text', { x: 10, y: 12, class: 'axis-label' });
  yLabel.textContent = options.yLabel;
  root.append(yLabel);

  return root;
}

/** A histogram from raw values. Returns the SVG plus the computed bins for testing. */
export function histogram(
  values: number[],
  options: {
    bins?: number;
    width?: number;
    height?: number;
    colour: string;
    xLabel: string;
    format?: (lo: number, hi: number, count: number) => string;
    highlightFrom?: number;
    highlightColour?: string;
  }
): SVGSVGElement {
  const binCount = options.bins ?? 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  const counts = new Array(binCount).fill(0);
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor(((value - min) / span) * binCount));
    counts[index] += 1;
  }
  const data: BarDatum[] = counts.map((count, i) => {
    const lo = min + (span / binCount) * i;
    const hi = lo + span / binCount;
    const highlighted = options.highlightFrom !== undefined && lo >= options.highlightFrom;
    return {
      label: i % 4 === 0 ? String(Math.round(lo)) : '',
      value: count,
      colour: highlighted ? options.highlightColour ?? options.colour : options.colour,
      tip: options.format ? options.format(lo, hi, count) : `${Math.round(lo)} to ${Math.round(hi)}: ${count}`,
    };
  });
  const chart = barSeries(data, {
    width: options.width ?? 780,
    height: options.height ?? 260,
    tickEvery: 1,
    yLabel: 'Storms',
  });
  const label = node('text', {
    x: (options.width ?? 780) / 2,
    y: (options.height ?? 260) - 1,
    'text-anchor': 'middle',
    class: 'axis-label',
  });
  label.textContent = options.xLabel;
  chart.append(label);
  return chart;
}

/**
 * A polyline of an intensity profile against elapsed time, with gaps where a value is
 * missing. Joining across a gap would invent a smooth curve through data that does not exist.
 */
export function profileLine(
  times: (number | null)[],
  values: (number | null)[],
  options: {
    width?: number;
    height?: number;
    colour: string;
    yLabel: string;
    invertY?: boolean;
    tipFor: (index: number, value: number, minutes: number) => string;
  }
): SVGSVGElement {
  const width = options.width ?? 640;
  const height = options.height ?? 220;
  const pad = { top: 14, right: 14, bottom: 30, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const root = svg(width, height, 'chart');

  const pairs = values
    .map((v, i) => ({ i, v, t: times[i] }))
    .filter((p): p is { i: number; v: number; t: number } => p.v !== null && p.t !== null);
  if (!pairs.length) {
    const empty = node('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'series-label' });
    empty.textContent = 'Not recorded for this storm';
    root.append(empty);
    return root;
  }

  const t0 = Math.min(...pairs.map((p) => p.t));
  const t1 = Math.max(...pairs.map((p) => p.t));
  const v0 = Math.min(...pairs.map((p) => p.v));
  const v1 = Math.max(...pairs.map((p) => p.v));
  const sx = (t: number) => pad.left + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const sy = (v: number) => {
    const norm = (v - v0) / Math.max(1e-9, v1 - v0);
    return pad.top + (options.invertY ? norm : 1 - norm) * plotH;
  };

  for (let i = 0; i <= 3; i += 1) {
    const value = v0 + ((v1 - v0) / 3) * i;
    const yy = finite(sy(value));
    root.append(node('line', { x1: pad.left, y1: yy, x2: width - pad.right, y2: yy, class: 'grid-line' }));
    const label = node('text', { x: pad.left - 6, y: yy + 3, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = String(Math.round(value));
    root.append(label);
  }

  // Break the path wherever the underlying series has a gap.
  let d = '';
  let previousIndex = -2;
  for (const point of pairs) {
    const command = point.i === previousIndex + 1 ? 'L' : 'M';
    d += `${command}${finite(sx(point.t)).toFixed(1)} ${finite(sy(point.v)).toFixed(1)} `;
    previousIndex = point.i;
  }
  root.append(node('path', { d: d.trim(), fill: 'none', stroke: options.colour, 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'mark-static' }));

  for (const point of pairs) {
    const dot = node('circle', {
      cx: finite(sx(point.t)),
      cy: finite(sy(point.v)),
      r: 3.4,
      fill: options.colour,
      class: 'mark-static',
    });
    dot.setAttribute('data-tip', options.tipFor(point.i, point.v, point.t));
    root.append(dot);
  }

  const label = node('text', { x: 6, y: 11, class: 'axis-label' });
  label.textContent = options.yLabel;
  root.append(label);
  const xAxis = node('text', { x: pad.left + plotW / 2, y: height - 8, 'text-anchor': 'middle', class: 'axis-label' });
  xAxis.textContent = 'Hours from first fix';
  root.append(xAxis);
  return root;
}

/** Build a legend row as HTML for use inside innerHTML-built panels. */
export function legendHtml(items: { colour: string; label: string; tip?: string }[]): string {
  return `<div class="legend">${items
    .map(
      (item) =>
        `<span class="legend-item"${item.tip ? ` data-tip="${attr(item.tip)}"` : ''}><span class="legend-swatch" style="background:${item.colour}"></span><span>${esc(item.label)}</span></span>`
    )
    .join('')}</div>`;
}
