// SPDX-FileCopyrightText: 2026 Ben Richardson
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE MODAL DISMISSAL CONTRACT.
//
// These tests assert STATE, never that a handler ran. A test that calls close() and checks
// "the handler fired" passes on a modal that is pinned open by CSS and cannot be dismissed by
// anyone — which is exactly how an unusable site shipped elsewhere in this fleet, with a
// working ✕, a working scrim handler AND working Escape, all of them powerless because the
// `[hidden]` guard was missing from the stylesheet.
//
// The overlay here removes its panel from the DOM rather than hiding it, so "dismissed" is
// asserted as "no longer in the document" — the strongest available form of the check, and one
// that is immune to the CSS trap entirely. The stylesheet's guard is asserted separately in
// hygiene.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeOverlay, isOverlayOpen, openOverlay } from '../src/overlay';

const CSS_RAW = readFileSync(join(import.meta.dirname, '..', 'src', 'styles.css'), 'utf8');
/** Scan CODE, not the comments explaining the code. The rule below is documented in a comment
 *  that necessarily quotes the banned construct ("Must NOT be pointer-events: none"), and a
 *  naive scan then flags its own explanation. Strip comments — never delete the explanation. */
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, '');

const scrim = () => document.querySelector('.overlay-scrim') as HTMLElement | null;
const panel = () => document.querySelector('.overlay-panel') as HTMLElement | null;
const closeButton = () => document.querySelector('.overlay-close') as HTMLButtonElement | null;

/**
 * jsdom does not implement PointerEvent, so build one on top of MouseEvent and carry the
 * pointerType across. Dispatching type 'pointerdown' still reaches an
 * addEventListener('pointerdown') handler, which is what the contract is wired to — and this
 * keeps the test honest about simulating TOUCH specifically, which is the case that broke
 * elsewhere in this fleet.
 */
function pointer(target: Element, type: 'pointerdown' | 'pointerup', pointerType = 'touch'): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  Object.defineProperty(event, 'isPrimary', { value: true });
  target.dispatchEvent(event);
}

beforeEach(() => {
  closeOverlay();
  document.body.innerHTML = '';
});

describe('baseline — nothing leaks before anything is opened', () => {
  it('has no overlay in the document', () => {
    expect(panel()).toBeNull();
    expect(scrim()).toBeNull();
    expect(isOverlayOpen()).toBe(false);
  });

  it('leaves no element hidden-by-attribute but still displayed', () => {
    for (const node of document.querySelectorAll('[hidden]')) {
      expect(getComputedStyle(node as HTMLElement).display).toBe('none');
    }
  });
});

describe('exit 1 — the close control', () => {
  it('dismisses the overlay', () => {
    openOverlay({ variant: 'modal', title: 'About' });
    expect(panel()).not.toBeNull();
    pointer(closeButton()!, 'pointerdown');
    expect(panel()).toBeNull();
    expect(isOverlayOpen()).toBe(false);
  });

  it('has a hit area of at least 44x44 CSS pixels', () => {
    // Asserted from the stylesheet, because jsdom does not lay out.
    const rule = /\.overlay-close\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(rule).toMatch(/width:\s*44px/);
    expect(rule).toMatch(/height:\s*44px/);
  });

  it('does not double-fire from a paired touch and click handler', () => {
    // A control wired to BOTH touchstart and click fires twice on one tap: it closes and
    // instantly reopens, which a user experiences as a dead close button.
    openOverlay({ variant: 'modal', title: 'About' });
    const button = closeButton()!;
    pointer(button, 'pointerdown');
    pointer(button, 'pointerup');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel()).toBeNull();
    expect(document.querySelectorAll('.overlay-panel')).toHaveLength(0);
  });
});

describe('exit 2 — tapping outside, on the scrim', () => {
  it('dismisses the overlay on pointerdown', () => {
    openOverlay({ variant: 'modal', title: 'About' });
    pointer(scrim()!, 'pointerdown');
    expect(panel()).toBeNull();
  });

  it('uses a real full-viewport hit area that is not click-through', () => {
    const rule = /\.overlay-scrim\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/inset:\s*0/);
    // pointer-events: none would make the scrim invisible to the tap and silently remove
    // this exit while leaving the code that implements it in place.
    expect(rule).not.toMatch(/pointer-events:\s*none/);
  });

  it('sits below the panel and above the page', () => {
    const scrimZ = Number(/--z-scrim:\s*(\d+)/.exec(CSS)?.[1]);
    const panelZ = Number(/--z-panel:\s*(\d+)/.exec(CSS)?.[1]);
    const headerZ = Number(/--z-header:\s*(\d+)/.exec(CSS)?.[1]);
    expect(headerZ).toBeLessThan(scrimZ);
    expect(scrimZ).toBeLessThan(panelZ);
  });

  it('does NOT dismiss when the tap lands inside the panel', () => {
    openOverlay({ variant: 'modal', title: 'About' });
    pointer(panel()!, 'pointerdown');
    expect(panel()).not.toBeNull();
  });
});

describe('exit 3 — Escape', () => {
  it('dismisses from anywhere in the document', () => {
    openOverlay({ variant: 'drawer', title: 'Cyclone Yasi' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel()).toBeNull();
  });

  it('works for a drawer as well as a modal', () => {
    openOverlay({ variant: 'drawer', title: 'Cyclone Tracy' });
    expect(document.querySelector('.overlay-drawer')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.overlay-drawer')).toBeNull();
  });
});

describe('exit 4 — a real touch sequence outside the panel', () => {
  it('dismisses on a genuine touch pointer event', () => {
    openOverlay({ variant: 'drawer', title: 'Cyclone Marcus' });
    const target = scrim()!;
    pointer(target, 'pointerdown');
    pointer(target, 'pointerup');
    expect(panel()).toBeNull();
  });
});

describe('the panel is detached, not merely hidden', () => {
  it('removes both the panel and the scrim from the DOM', () => {
    // A closed off-canvas drawer parked at translateX(100%) is still a real box on iOS Safari
    // and scrolls the page sideways; `overflow-x: clip` neither fixes that nor lets
    // scrollWidth detect it. Detaching is the only reliable fix.
    openOverlay({ variant: 'drawer', title: 'Cyclone Alfred' });
    closeOverlay();
    expect(document.querySelector('.overlay-panel')).toBeNull();
    expect(document.querySelector('.overlay-scrim')).toBeNull();
  });

  it('restores body scrolling', () => {
    openOverlay({ variant: 'modal', title: 'About' });
    expect(document.body.style.overflow).toBe('hidden');
    closeOverlay();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('opening a second overlay', () => {
  it('replaces the first rather than stacking two panels', () => {
    openOverlay({ variant: 'modal', title: 'About' });
    openOverlay({ variant: 'drawer', title: 'Cyclone Yasi' });
    expect(document.querySelectorAll('.overlay-panel')).toHaveLength(1);
    expect(document.querySelectorAll('.overlay-scrim')).toHaveLength(1);
  });
});

describe('accessibility', () => {
  it('is a labelled modal dialog', () => {
    openOverlay({ variant: 'modal', title: 'About Cyclone Tracks' });
    const node = panel()!;
    expect(node.getAttribute('role')).toBe('dialog');
    expect(node.getAttribute('aria-modal')).toBe('true');
    expect(node.getAttribute('aria-label')).toBe('About Cyclone Tracks');
  });

  it('names the close control for a screen reader', () => {
    openOverlay({ variant: 'modal', title: 'About' });
    expect(closeButton()!.getAttribute('aria-label')).toMatch(/close/i);
  });

  it('calls onClose exactly once, however it is dismissed', () => {
    let calls = 0;
    openOverlay({ variant: 'modal', title: 'About', onClose: () => { calls += 1; } });
    pointer(closeButton()!, 'pointerdown');
    closeOverlay();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(calls).toBe(1);
  });
});
