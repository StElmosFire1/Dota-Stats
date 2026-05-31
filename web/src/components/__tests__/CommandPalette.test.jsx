// Command palette / global search behaviour tests (Task #591).
//
// CommandPalette (`web/src/components/CommandPalette.jsx`) is a keyboard-heavy,
// ARIA-rich surface: a combobox driving a listbox via aria-activedescendant,
// arrow / Enter / Home / End navigation, ⌘K / Ctrl-K global open, and
// Escape-to-close inherited from the shared <Dialog> primitive. None of that
// was covered, so a refactor of the Dialog focus-trap or the result builder
// could silently break keyboard nav. These tests lock the behaviour in.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────
// The palette pulls Players / Coaches / Teams / Tournaments from one bounded
// server lookup (globalSearch). Stub it so the grouped-result path is exercised
// deterministically without a network. Heroes are matched in-process against
// the real static registry, so we leave heroNames un-mocked.
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateSpy };
});

const globalSearchMock = vi.fn();
vi.mock('../../api', () => ({
  globalSearch: (...args) => globalSearchMock(...args),
}));

import GlobalSearch from '../CommandPalette.jsx';

const SEARCH_RESULT = {
  players: [
    { account_id: 42, player_key: 'k42', name: 'Invoker Main', persona_name: 'InvoMain', games_played: 12 },
  ],
  coaches: [
    { id: 7, name: 'Coach Invy', hourly_rate_cents: 5000, currency: 'aud', taught_roles: 'mid' },
  ],
  teams: [
    { id: 3, name: 'Team Invincible', tag: 'INV', member_count: 5 },
  ],
  tournaments: [
    { id: 9, name: 'Invitational Cup', status: 'live', season_name: 'S1' },
  ],
};

function flushFocusTimer() {
  // Dialog defers initial focus into setTimeout(0); advance fake timers to fire.
  act(() => { vi.advanceTimersByTime(1); });
}

function runDebounce() {
  // The server lookup is debounced 200ms inside a setTimeout, and globalSearch
  // resolves a promise. Advance timers then flush microtasks.
  act(() => { vi.advanceTimersByTime(250); });
  return act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function renderApp() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>,
  );
}

describe('CommandPalette / global search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateSpy.mockReset();
    globalSearchMock.mockReset();
    globalSearchMock.mockResolvedValue(SEARCH_RESULT);
    document.body.style.overflow = '';
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  it('opens via ⌘K and focuses the combobox input', () => {
    renderApp();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const input = dialog.querySelector('input[role="combobox"]');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('opens via Ctrl+K as well', () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true });
    flushFocusTimer();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('opens via the header trigger button', () => {
    const { getByRole } = renderApp();
    fireEvent.click(getByRole('button', { name: /search/i }));
    flushFocusTimer();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('typing a query renders grouped results from the server plus heroes', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();

    const input = document.querySelector('input[role="combobox"]');
    fireEvent.change(input, { target: { value: 'inv' } });
    await runDebounce();

    expect(globalSearchMock).toHaveBeenCalledWith('inv');

    const listbox = document.querySelector('[role="listbox"]');
    const groupTitles = Array.from(listbox.querySelectorAll('.cmdk-group-title')).map(n => n.textContent);
    expect(groupTitles).toEqual(
      expect.arrayContaining(['Players', 'Coaches', 'Teams', 'Tournaments', 'Heroes']),
    );

    // Server rows surfaced by label.
    expect(within(listbox).getByText('Invoker Main')).toBeInTheDocument();
    expect(within(listbox).getByText('Coach Invy')).toBeInTheDocument();
    // Heroes matched in-process from the static registry (e.g. Invoker).
    const heroGroup = Array.from(listbox.querySelectorAll('.cmdk-group'))
      .find(g => g.querySelector('.cmdk-group-title')?.textContent === 'Heroes');
    expect(within(heroGroup).getByText('Invoker')).toBeInTheDocument();
  });

  it('arrow keys move the highlight via aria-activedescendant; Home/End jump to ends', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();

    const input = document.querySelector('input[role="combobox"]');
    fireEvent.change(input, { target: { value: 'inv' } });
    await runDebounce();

    const options = Array.from(document.querySelectorAll('[role="option"]'));
    expect(options.length).toBeGreaterThan(1);

    // First option highlighted initially.
    expect(input.getAttribute('aria-activedescendant')).toBe('cmdk-opt-0');
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    // ArrowDown moves to the second option.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('cmdk-opt-1');
    expect(document.getElementById('cmdk-opt-1').getAttribute('aria-selected')).toBe('true');

    // ArrowUp wraps back to the first.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe('cmdk-opt-0');

    // ArrowUp from the first wraps to the last.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const lastIdx = options.length - 1;
    expect(input.getAttribute('aria-activedescendant')).toBe(`cmdk-opt-${lastIdx}`);

    // Home / End jump to the extremes.
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input.getAttribute('aria-activedescendant')).toBe('cmdk-opt-0');
    fireEvent.keyDown(input, { key: 'End' });
    expect(input.getAttribute('aria-activedescendant')).toBe(`cmdk-opt-${lastIdx}`);
  });

  it('Enter navigates to the highlighted result and closes the palette', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();

    const input = document.querySelector('input[role="combobox"]');
    fireEvent.change(input, { target: { value: 'inv' } });
    await runDebounce();

    // First result is the top-ranked player ("Invoker Main", account_id 42).
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith('/player/42');
    // onClose fired → dialog gone.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('clicking an option navigates to its path and closes', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();

    const input = document.querySelector('input[role="combobox"]');
    fireEvent.change(input, { target: { value: 'inv' } });
    await runDebounce();

    const listbox = document.querySelector('[role="listbox"]');
    fireEvent.click(within(listbox).getByText('Coach Invy'));

    expect(navigateSpy).toHaveBeenCalledWith('/coaches/7');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Escape closes the palette (Dialog contract)', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows quick-link jump targets before anything is typed and skips the server', () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();

    const listbox = document.querySelector('[role="listbox"]');
    expect(within(listbox).getByText('Jump to')).toBeInTheDocument();
    // The five section landing pages.
    ['Players', 'Coaches', 'Teams', 'Tournaments', 'Heroes'].forEach((label) => {
      expect(within(listbox).getByText(label)).toBeInTheDocument();
    });
    expect(globalSearchMock).not.toHaveBeenCalled();
  });

  it('does not hit the server for queries shorter than 2 chars', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    flushFocusTimer();

    const input = document.querySelector('input[role="combobox"]');
    fireEvent.change(input, { target: { value: 'i' } });
    await runDebounce();

    expect(globalSearchMock).not.toHaveBeenCalled();
  });
});
