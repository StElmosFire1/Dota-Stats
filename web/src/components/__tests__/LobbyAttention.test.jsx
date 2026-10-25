import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LobbyAttention from '../LobbyAttention';
import { openLobbyReminderSettings } from '../../lib/lobbyReminderSettings';

const mocks = vi.hoisted(() => ({
  user: { accountId: 99 },
  testChime: vi.fn(),
  setMuted: vi.fn(),
  playReminder: vi.fn(),
}));
vi.mock('../../context/SteamAuthContext', () => ({ useSteamAuth: () => ({ steamUser: mocks.user }) }));
vi.mock('../../hooks/useInhouseAlerts', () => ({
  useInhouseAlerts: () => ({ testChime: mocks.testChime, setMuted: mocks.setMuted, playReminder: mocks.playReminder }),
}));

async function setup() {
  render(<MemoryRouter>
    <button onClick={openLobbyReminderSettings}>Open reminder settings</button>
    <LobbyAttention />
  </MemoryRouter>);
  await act(async () => {});
}

describe('lobby reminder settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.user = { accountId: 99 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session: null, players: [] }) }));
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('opens a visible dialog without enabling reminders or asking permission; Escape restores focus', async () => {
    await setup();
    const trigger = screen.getByRole('button', { name: 'Open reminder settings' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Lobby reminder settings' });
    expect(within(dialog).getByText('Reminders are off.')).toBeTruthy();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(mocks.testChime).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('updates and saves the opt-in immediately, even while permission is unanswered, and can turn it off', async () => {
    let grant;
    Notification.requestPermission.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open reminder settings' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn lobby reminders on' }));
    expect(within(dialog).getByText('Reminders are on.')).toBeTruthy();
    expect(localStorage.getItem('oi.lobby-attention.99')).toBe('true');
    expect(mocks.setMuted).toHaveBeenCalledWith(false);
    expect(mocks.testChime).toHaveBeenCalledTimes(1);
    await act(async () => grant('granted'));
    expect(within(dialog).getByText('Desktop notifications: allowed.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test / resume sound' }));
    expect(mocks.testChime).toHaveBeenCalledTimes(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn lobby reminders off' }));
    expect(localStorage.getItem('oi.lobby-attention.99')).toBe('false');
    expect(within(dialog).getByRole('button', { name: 'Test / resume sound' }).disabled).toBe(true);
  });

  it('restores saved opt-in and explains denied desktop permissions without repeated prompts', async () => {
    localStorage.setItem('oi.lobby-attention.99', 'true');
    Notification.permission = 'denied';
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open reminder settings' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Reminders are on.')).toBeTruthy();
    expect(within(dialog).getByText(/blocked in your browser/)).toBeTruthy();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('works without a desktop Notification API', async () => {
    vi.stubGlobal('Notification', undefined);
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open reminder settings' }));
    expect(screen.getByText('Desktop notifications: not supported in this browser.')).toBeTruthy();
  });
});
