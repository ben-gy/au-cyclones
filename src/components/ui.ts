// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Small shared building blocks: panels, stat tiles, legends, tables and the glossary popover.

import { GLOSSARY } from '../glossary';
import { CLASS_COLOUR, UNMEASURED_COLOUR } from '../palette';
import { attr, esc } from '../format';
import type { Meta, PressureClassId } from '../types';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function panel(title: string, subtitle?: string): HTMLElement {
  const section = el('section', 'panel');
  const head = el('div', 'panel-head');
  head.append(el('h2', 'panel-title', esc(title)));
  if (subtitle) head.append(el('p', 'panel-sub', subtitle));
  section.append(head);
  return section;
}

export function statRow(stats: { value: string; label: string; tip?: string }[]): HTMLElement {
  const row = el('div', 'stat-row');
  for (const stat of stats) {
    const tile = el('div', 'stat');
    if (stat.tip) tile.setAttribute('data-tip', stat.tip);
    tile.append(el('div', 'stat-value', esc(stat.value)), el('div', 'stat-label', esc(stat.label)));
    row.append(tile);
  }
  return row;
}

/**
 * The severity legend, used identically in every view that colours by pressure class.
 * `onToggle` makes the swatches interactive filters rather than decoration — a legend that
 * looks clickable and is not is a dead click.
 */
export function severityLegend(
  meta: Meta,
  options: { active?: Set<PressureClassId | 'none'>; onToggle?: (id: PressureClassId | 'none') => void } = {}
): HTMLElement {
  const legend = el('div', 'legend');
  const entries: { id: PressureClassId | 'none'; label: string; colour: string }[] = [
    ...meta.pressureClasses.map((c) => ({ id: c.id, label: c.label, colour: CLASS_COLOUR[c.id] })),
    { id: 'none', label: 'Not recorded', colour: UNMEASURED_COLOUR },
  ];
  for (const entry of entries) {
    const swatch = `<span class="legend-swatch" style="background:${entry.colour}"></span><span>${esc(entry.label)}</span>`;
    if (options.onToggle) {
      const button = el('button', 'legend-button', swatch);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(options.active?.has(entry.id) ?? true));
      button.setAttribute(
        'data-tip',
        entry.id === 'none'
          ? 'Storms with no central-pressure reading at all. Click to show or hide them.'
          : `Minimum central pressure ${entry.label.toLowerCase()}. Click to show or hide.`
      );
      button.addEventListener('click', () => options.onToggle?.(entry.id));
      legend.append(button);
    } else {
      legend.append(el('span', 'legend-item', swatch));
    }
  }
  return legend;
}

export interface Column<T> {
  key: string;
  label: string;
  /** Right-aligned monospace. */
  numeric?: boolean;
  tip?: string;
  value: (row: T) => string | number | null;
  render?: (row: T) => HTMLElement | string;
  sort?: (a: T, b: T) => number;
}

/**
 * A sortable table. Sorting is by an explicit comparator per column so that "Not recorded"
 * sorts to the end rather than being read as zero, which would rank every unmeasured storm
 * as the most intense on the page.
 */
export function sortableTable<T>(
  rows: T[],
  columns: Column<T>[],
  options: { initialSort?: string; descending?: boolean; onRow?: (row: T) => void } = {}
): HTMLElement {
  const wrap = el('div', 'table-wrap');
  const table = el('table', 'data-table');
  const thead = el('thead');
  const headRow = el('tr');
  const tbody = el('tbody');

  let sortKey = options.initialSort ?? columns[0].key;
  let descending = options.descending ?? true;

  const draw = () => {
    const column = columns.find((c) => c.key === sortKey);
    const sorted = [...rows];
    if (column) {
      const compare =
        column.sort ??
        ((a: T, b: T) => {
          const av = column.value(a);
          const bv = column.value(b);
          if (av === null) return 1;
          if (bv === null) return -1;
          return typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv));
        });
      sorted.sort((a, b) => {
        // Nulls always sink, in both directions — they are "not recorded", not extreme.
        const av = column.value(a);
        const bv = column.value(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return descending ? -compare(a, b) : compare(a, b);
      });
    }

    tbody.innerHTML = '';
    for (const row of sorted) {
      const tr = el('tr');
      for (const column2 of columns) {
        const td = el('td', column2.numeric ? 'n' : undefined);
        const rendered = column2.render ? column2.render(row) : String(column2.value(row) ?? '—');
        if (typeof rendered === 'string') td.textContent = rendered;
        else td.append(rendered);
        tr.append(td);
      }
      if (options.onRow) {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (event) => {
          // Let an inner button handle its own click rather than firing twice.
          if ((event.target as HTMLElement).closest('button')) return;
          options.onRow?.(row);
        });
      }
      tbody.append(tr);
    }

    for (const th of headRow.querySelectorAll('th')) {
      const key = th.dataset.key;
      const caret = th.querySelector('.sort-caret');
      if (caret) caret.textContent = key === sortKey ? (descending ? ' ▾' : ' ▴') : '';
      th.setAttribute('aria-sort', key === sortKey ? (descending ? 'descending' : 'ascending') : 'none');
    }
  };

  for (const column of columns) {
    const th = el('th', 'sortable');
    th.dataset.key = column.key;
    th.innerHTML = `${esc(column.label)}<span class="sort-caret"></span>`;
    if (column.tip) th.setAttribute('data-tip', column.tip);
    th.addEventListener('click', () => {
      if (sortKey === column.key) descending = !descending;
      else {
        sortKey = column.key;
        descending = true;
      }
      draw();
    });
    headRow.append(th);
  }

  thead.append(headRow);
  table.append(thead, tbody);
  wrap.append(table);
  draw();
  return wrap;
}

/** A labelled horizontal bar row with a hover tooltip carrying the exact value. */
export function barRow(
  label: string,
  value: number,
  max: number,
  display: string,
  colour: string,
  tip: string,
  onClick?: () => void
): HTMLElement {
  const row = el('div', 'bar-row');
  const labelNode = el(onClick ? 'button' : 'span', onClick ? 'bar-label row-button' : 'bar-label');
  labelNode.textContent = label;
  if (onClick) {
    (labelNode as HTMLButtonElement).type = 'button';
    labelNode.addEventListener('click', onClick);
  }
  const track = el('div', 'bar-track');
  track.setAttribute('data-tip', tip);
  const fill = el('span', 'bar-fill');
  fill.style.width = `${max > 0 ? Math.max(1.5, (value / max) * 100) : 0}%`;
  fill.style.background = colour;
  track.append(fill);
  row.append(labelNode, track, el('span', 'bar-value', esc(display)));
  return row;
}

export function callout(html: string, warn = false): HTMLElement {
  return el('div', warn ? 'callout callout-warn' : 'callout', html);
}

export function errorBox(message: string, onRetry?: () => void): HTMLElement {
  const box = el('div', 'error-box');
  box.append(el('p', undefined, esc(message)));
  if (onRetry) {
    const button = el('button', 'retry-button', 'Try again');
    button.type = 'button';
    button.addEventListener('click', onRetry);
    box.append(button);
  }
  return box;
}

/**
 * The glossary popover. Delegated from the document so it works for markup rendered at any
 * time, and dismissed by pointerdown outside, by Escape, and by scrolling — a definition that
 * cannot be dismissed is the same defect as a modal that cannot be closed, in miniature.
 */
export function initGlossary(): void {
  let popover: HTMLElement | null = null;

  const close = () => {
    popover?.remove();
    popover = null;
  };

  document.addEventListener('click', (event) => {
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('.glossary-link');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const entry = GLOSSARY[trigger.dataset.term ?? ''];
    if (!entry) return;

    const wasOpenForThis = popover?.dataset.for === trigger.dataset.term;
    close();
    if (wasOpenForThis) return;

    popover = el('div', 'glossary-pop');
    popover.dataset.for = trigger.dataset.term ?? '';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', entry.term);
    popover.innerHTML = `<div class="glossary-term">${esc(entry.term)}</div><div>${esc(entry.definition)}</div>`;
    document.body.append(popover);

    const rect = trigger.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    // Flip against the viewport edges rather than overflowing them, which on a phone would
    // push the definition off-screen and cause a horizontal scroll.
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const above = rect.top > height + 12;
    popover.style.left = `${left}px`;
    popover.style.top = above ? `${rect.top - height - 8}px` : `${rect.bottom + 8}px`;
  });

  document.addEventListener('pointerdown', (event) => {
    if (!popover) return;
    const target = event.target as HTMLElement;
    if (popover.contains(target) || target.closest('.glossary-link')) return;
    close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  window.addEventListener('scroll', close, { passive: true });
}

/** Build a `data-tip` attribute string safely for innerHTML-built markup. */
export function tip(text: string): string {
  return ` data-tip="${attr(text)}"`;
}
