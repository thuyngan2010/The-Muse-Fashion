import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { raiseToastLayer } from './toast.component';

function fakeStack(open: boolean, modalOpen: boolean) {
  const state = { open };
  const order: string[] = [];
  const el = {
    matches: (selector: string) => selector === ':popover-open' && state.open,
    showPopover: vi.fn(() => { state.open = true; order.push('show'); }),
    hidePopover: vi.fn(() => { state.open = false; order.push('hide'); }),
    ownerDocument: { querySelector: (selector: string) => (selector === 'dialog:modal' && modalOpen ? {} : null) },
  };
  return { el: el as unknown as HTMLElement, raw: el, state, order };
}

describe('Thông báo (toast) hiện phía trước drawer/modal', () => {
  it('the toast stack is a manual popover so it can enter the top layer', () => {
    const source = readFileSync(new URL('./toast.component.ts', import.meta.url), 'utf8');
    expect(source).toContain('popover="manual"');
  });

  it('opens the popover when a toast appears', () => {
    const { el, state } = fakeStack(false, false);
    raiseToastLayer(el, true);
    expect(state.open).toBe(true);
  });

  it('re-opens the popover above a drawer/modal that was opened later', () => {
    const { el, order } = fakeStack(true, true);
    raiseToastLayer(el, true);
    expect(order).toEqual(['hide', 'show']);
  });

  it('leaves an open stack alone when no modal is open (no re-animation)', () => {
    const { el, raw } = fakeStack(true, false);
    raiseToastLayer(el, true);
    expect(raw.hidePopover).not.toHaveBeenCalled();
    expect(raw.showPopover).not.toHaveBeenCalled();
  });

  it('closes the popover when the last toast is gone', () => {
    const { el, state } = fakeStack(true, true);
    raiseToastLayer(el, false);
    expect(state.open).toBe(false);
  });

  it('does nothing in browsers without the Popover API', () => {
    expect(() => raiseToastLayer({} as HTMLElement, true)).not.toThrow();
  });
});
