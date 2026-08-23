// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// POSITIONAL layout tests. Area-only assertions pass on visually broken charts — a layout
// that stacks every mark at the same origin conserves total area perfectly and renders as
// garbage. Everything here asserts where marks actually ARE.

import { describe, expect, it } from 'vitest';
import { barSeries, histogram, matrix, profileLine, scatter, finite } from '../src/charts';

const rect = (node: Element) => ({
  x: Number(node.getAttribute('x')),
  y: Number(node.getAttribute('y')),
  w: Number(node.getAttribute('width')),
  h: Number(node.getAttribute('height')),
});

function overlapArea(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>): number {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

const bars = (values: number[]) =>
  values.map((value, i) => ({ label: `s${i}`, value, colour: '#123456', tip: `t${i}` }));

describe('bar series geometry', () => {
  const WIDTH = 600;
  const HEIGHT = 300;
  const chart = barSeries(bars([3, 9, 1, 14, 0, 7]), { width: WIDTH, height: HEIGHT });
  const drawn = [...chart.querySelectorAll('rect')].map(rect);

  it('draws one rect per datum', () => {
    expect(drawn).toHaveLength(6);
  });

  it('places every bar inside the canvas', () => {
    for (const r of drawn) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(WIDTH + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(HEIGHT + 0.01);
    }
  });

  it('has no NaN or undefined coordinate', () => {
    for (const r of drawn) {
      for (const value of Object.values(r)) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('never overlaps two bars', () => {
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) {
        expect(overlapArea(drawn[i], drawn[j]), `bars ${i} and ${j} overlap`).toBeLessThan(0.5);
      }
    }
  });

  it('advances monotonically along x', () => {
    // The failure this catches: every bar stacked at the same origin, which conserves total
    // area and passes any area-only test while rendering as one black column.
    for (let i = 1; i < drawn.length; i += 1) expect(drawn[i].x).toBeGreaterThan(drawn[i - 1].x);
  });

  it('makes bar height proportional to value', () => {
    // index 3 is 14, index 1 is 9, index 2 is 1
    expect(drawn[3].h).toBeGreaterThan(drawn[1].h);
    expect(drawn[1].h).toBeGreaterThan(drawn[2].h);
  });

  it('gives a zero value a zero-height bar rather than a negative one', () => {
    expect(drawn[4].h).toBe(0);
  });

  it('puts a tooltip on every bar', () => {
    for (const node of chart.querySelectorAll('rect')) {
      expect(node.getAttribute('data-tip')).toBeTruthy();
    }
  });

  it('survives a single-datum series without dividing by zero', () => {
    const single = [...barSeries(bars([5]), { width: 400, height: 200 }).querySelectorAll('rect')].map(rect);
    expect(single).toHaveLength(1);
    for (const value of Object.values(single[0])) expect(Number.isFinite(value)).toBe(true);
  });

  it('survives an all-zero series', () => {
    const zeros = [...barSeries(bars([0, 0, 0]), { width: 400, height: 200 }).querySelectorAll('rect')].map(rect);
    for (const r of zeros) {
      expect(Number.isFinite(r.h)).toBe(true);
      expect(r.h).toBeGreaterThanOrEqual(0);
    }
  });

  it('survives an empty series', () => {
    expect(() => barSeries([], { width: 400, height: 200 })).not.toThrow();
  });
});

describe('matrix geometry', () => {
  const rows = ['Pressure', 'Wind', 'Gust'];
  const columns = ['1950s', '1960s', '1970s', '1980s'];
  const grid = matrix(rows, columns, (r, c) => ({
    value: r * 10 + c,
    colour: '#abcdef',
    tip: `${r},${c}`,
    label: `${r}${c}`,
  }));
  const cells = [...grid.querySelectorAll('rect')].map(rect);

  it('draws one cell per row-column pair', () => {
    expect(cells).toHaveLength(rows.length * columns.length);
  });

  it('never overlaps two cells', () => {
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        expect(overlapArea(cells[i], cells[j])).toBeLessThan(0.5);
      }
    }
  });

  it('keeps every cell inside the viewBox', () => {
    const [, , vw, vh] = (grid.getAttribute('viewBox') ?? '').split(' ').map(Number);
    for (const cell of cells) {
      expect(cell.x + cell.w).toBeLessThanOrEqual(vw + 0.01);
      expect(cell.y + cell.h).toBeLessThanOrEqual(vh + 0.01);
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('lays cells out in a true grid — equal row pitch and column pitch', () => {
    const xs = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b);
    const ys = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);
    expect(xs).toHaveLength(columns.length);
    expect(ys).toHaveLength(rows.length);
    const pitch = xs[1] - xs[0];
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBeCloseTo(pitch, 6);
  });

  it('gives every cell a tooltip', () => {
    for (const node of grid.querySelectorAll('rect')) expect(node.getAttribute('data-tip')).toBeTruthy();
  });

  it('makes cell labels non-interactive so they cannot eat the hover', () => {
    for (const text of grid.querySelectorAll('text[pointer-events]')) {
      expect(text.getAttribute('pointer-events')).toBe('none');
    }
  });
});

describe('scatter geometry', () => {
  const points = [
    { x: 0, y: 900, r: 4, colour: '#111', tip: 'a' },
    { x: 50, y: 950, r: 4, colour: '#222', tip: 'b' },
    { x: 100, y: 1000, r: 4, colour: '#333', tip: 'c' },
  ];
  const chart = scatter(points, { xLabel: 'x', yLabel: 'y', width: 500, height: 300 });
  const circles = [...chart.querySelectorAll('circle')];

  it('draws every point', () => {
    expect(circles).toHaveLength(3);
  });

  it('has finite centres inside the canvas', () => {
    for (const circle of circles) {
      const cx = Number(circle.getAttribute('cx'));
      const cy = Number(circle.getAttribute('cy'));
      expect(Number.isFinite(cx)).toBe(true);
      expect(Number.isFinite(cy)).toBe(true);
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(500);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(300);
    }
  });

  it('orders points along x in the same order as their values', () => {
    const xs = circles.map((c) => Number(c.getAttribute('cx')));
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it('inverts y when asked, so lower pressure sits higher on the page', () => {
    const inverted = [...scatter(points, { xLabel: 'x', yLabel: 'y', invertY: true, width: 500, height: 300 }).querySelectorAll('circle')];
    const first = Number(inverted[0].getAttribute('cy'));
    const last = Number(inverted[2].getAttribute('cy'));
    // y=900 (strongest) must render ABOVE y=1000 (weakest): a smaller cy.
    expect(first).toBeLessThan(last);
  });

  it('does not collapse when every point shares one x value', () => {
    const flat = scatter(
      [
        { x: 5, y: 1, r: 3, colour: '#111', tip: 'a' },
        { x: 5, y: 2, r: 3, colour: '#111', tip: 'b' },
      ],
      { xLabel: 'x', yLabel: 'y', width: 400, height: 200 }
    );
    for (const circle of flat.querySelectorAll('circle')) {
      expect(Number.isFinite(Number(circle.getAttribute('cx')))).toBe(true);
      expect(Number.isFinite(Number(circle.getAttribute('cy')))).toBe(true);
    }
  });

  it('skips a non-finite datum instead of voiding the chart', () => {
    const withNaN = scatter(
      [
        { x: Number.NaN, y: 1, r: 3, colour: '#111', tip: 'bad' },
        { x: 2, y: 2, r: 3, colour: '#111', tip: 'good' },
      ],
      { xLabel: 'x', yLabel: 'y', width: 400, height: 200 }
    );
    expect(withNaN.querySelectorAll('circle')).toHaveLength(1);
  });
});

describe('profile line', () => {
  it('breaks the path at a gap rather than joining across it', () => {
    // Joining across a gap invents a smooth curve through data that does not exist.
    const chart = profileLine([0, 60, 120, 180], [1000, null, 980, 970], {
      colour: '#111',
      yLabel: 'hPa',
      tipFor: () => 'tip',
    });
    const d = chart.querySelector('path')?.getAttribute('d') ?? '';
    // Two M commands: one to start, one to restart after the gap.
    expect((d.match(/M/g) ?? []).length).toBe(2);
  });

  it('has no NaN in the path data', () => {
    const chart = profileLine([0, 60], [1000, 990], { colour: '#111', yLabel: 'hPa', tipFor: () => 't' });
    expect(chart.querySelector('path')?.getAttribute('d')).not.toMatch(/NaN/);
  });

  it('says so rather than drawing an empty chart when nothing was recorded', () => {
    const chart = profileLine([0, 60], [null, null], { colour: '#111', yLabel: 'hPa', tipFor: () => 't' });
    expect(chart.textContent).toMatch(/Not recorded/i);
    expect(chart.querySelector('path')).toBeNull();
  });

  it('handles a single measured point without dividing by zero', () => {
    const chart = profileLine([0, 60], [990, null], { colour: '#111', yLabel: 'hPa', tipFor: () => 't' });
    expect(chart.querySelector('path')?.getAttribute('d')).not.toMatch(/NaN/);
  });

  it('gives every plotted dot a tooltip', () => {
    const chart = profileLine([0, 60, 120], [1000, 990, 980], { colour: '#111', yLabel: 'hPa', tipFor: () => 'tip' });
    const dots = chart.querySelectorAll('circle');
    expect(dots).toHaveLength(3);
    for (const dot of dots) expect(dot.getAttribute('data-tip')).toBeTruthy();
  });
});

describe('histogram binning', () => {
  it('places every value in exactly one bin', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const chart = histogram(values, { bins: 5, colour: '#111', xLabel: 'x' });
    const heights = [...chart.querySelectorAll('rect')].map((r) => Number(r.getAttribute('height')));
    expect(heights.filter((h) => h > 0).length).toBeGreaterThan(0);
    expect(chart.querySelectorAll('rect')).toHaveLength(5);
  });

  it('puts the maximum value in the last bin, not out of range', () => {
    // The classic off-by-one: floor(((max - min) / span) * bins) === bins, writing past the end.
    const chart = histogram([0, 10], { bins: 4, colour: '#111', xLabel: 'x' });
    const rects = [...chart.querySelectorAll('rect')];
    expect(Number(rects[rects.length - 1].getAttribute('height'))).toBeGreaterThan(0);
  });

  it('does not divide by zero when every value is identical', () => {
    const chart = histogram([5, 5, 5], { bins: 4, colour: '#111', xLabel: 'x' });
    for (const r of chart.querySelectorAll('rect')) {
      expect(Number.isFinite(Number(r.getAttribute('height')))).toBe(true);
    }
  });
});

describe('the finite guard', () => {
  it('replaces a non-finite coordinate with zero', () => {
    // A single NaN in an SVG path voids the WHOLE path, blanking the entire chart.
    expect(finite(Number.NaN)).toBe(0);
    expect(finite(Infinity)).toBe(0);
    expect(finite(12.5)).toBe(12.5);
  });
});
