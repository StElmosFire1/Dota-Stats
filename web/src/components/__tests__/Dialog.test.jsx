// Dialog primitive behaviour tests (Task #173).
//
// Locks in the keyboard / focus / scroll-lock contracts that every modal in
// the app depends on. Task #165 introduced the shared Dialog primitive
// (`web/src/components/Dialog.jsx`, mirrored to
// `community-edition/web/src/components/Dialog.jsx`) — these tests guard
// the documented behaviours so a future "small refactor" can't silently
// break every modal at once.

import React, { useRef, useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';

import Dialog from '../Dialog.jsx';

function Harness({
  initialOpen = true,
  closeOnBackdrop,
  closeOnEscape,
  useInitialFocus = false,
  children,
}) {
  const [open, setOpen] = useState(initialOpen);
  const initRef = useRef(null);
  return (
    <div>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label="Test dialog"
        closeOnBackdrop={closeOnBackdrop}
        closeOnEscape={closeOnEscape}
        initialFocusRef={useInitialFocus ? initRef : undefined}
      >
        <button type="button" data-testid="first">first</button>
        <input data-testid="middle" />
        <button type="button" ref={initRef} data-testid="initial">initial</button>
        <button type="button" data-testid="last">last</button>
      </Dialog>
    </div>
  );
}

function flushFocusTimer() {
  // The Dialog defers initial focus into a setTimeout(0) so the React commit
  // has settled. Advance fake timers to fire it.
  act(() => {
    vi.advanceTimersByTime(1);
  });
}

describe('Dialog primitive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  it('captures focus on open and restores it to the trigger on close', () => {
    const { getByTestId, queryByRole } = render(<Harness initialOpen={false} />);
    const opener = getByTestId('opener');
    opener.focus();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    flushFocusTimer();
    expect(document.activeElement).toBe(getByTestId('first'));

    // Close via Escape.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Escape closes the dialog by default', () => {
    const { getByRole, queryByRole } = render(<Harness />);
    flushFocusTimer();
    expect(getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('closeOnEscape={false} suppresses Escape closing the dialog', () => {
    const { getByRole } = render(<Harness closeOnEscape={false} />);
    flushFocusTimer();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(getByRole('dialog')).toBeInTheDocument();
  });

  it('Tab from the last focusable wraps to the first; Shift+Tab from first wraps to last', () => {
    const { getByTestId } = render(<Harness />);
    flushFocusTimer();

    const first = getByTestId('first');
    const last = getByTestId('last');

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Tab from outside the dialog (focus escaped) is pulled back inside', () => {
    const { getByTestId } = render(<Harness />);
    flushFocusTimer();

    // Simulate focus having escaped the dialog content (e.g. the browser
    // moved it to <body>).
    document.body.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('first'));

    document.body.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('last'));
  });

  it('backdrop click closes the dialog by default; clicks on content do not', () => {
    const { getByRole, queryByRole } = render(<Harness />);
    flushFocusTimer();

    const dialog = getByRole('dialog');
    // Click inside the dialog content — must NOT close.
    fireEvent.click(dialog);
    expect(getByRole('dialog')).toBeInTheDocument();

    // Click on the backdrop (the dialog's parent, role=presentation).
    fireEvent.click(dialog.parentElement);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('closeOnBackdrop={false} suppresses backdrop-click closing', () => {
    const { getByRole } = render(<Harness closeOnBackdrop={false} />);
    flushFocusTimer();
    const dialog = getByRole('dialog');
    fireEvent.click(dialog.parentElement);
    expect(getByRole('dialog')).toBeInTheDocument();
  });

  it('locks body scroll while open and restores the previous overflow on close', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(<Harness />);
    flushFocusTimer();
    expect(document.body.style.overflow).toBe('hidden');

    // Closing via Escape triggers cleanup which restores overflow.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('auto');
    unmount();
  });

  it('initialFocusRef overrides the auto-first-focusable behaviour', () => {
    const { getByTestId } = render(<Harness useInitialFocus />);
    flushFocusTimer();
    expect(document.activeElement).toBe(getByTestId('initial'));
  });
});
