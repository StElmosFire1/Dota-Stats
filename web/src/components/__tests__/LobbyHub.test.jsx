import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LobbyHub from '../LobbyHub';
import LobbyChat from '../LobbyChat';

const player = { account_id: 42, display_name: 'Moss', status: 'registered' };
const snapshot = { session: { id: 17, status: 'open' }, players: [player], draft: null };
const response = (payload, ok = true) => ({ ok, status: ok ? 200 : 429, json: async () => payload });
const renderHub = (props = {}, route = '/') => render(
  <MemoryRouter initialEntries={[route]}>
    <LobbyHub snapshot={snapshot} accountId={9} steamUser={{ accountId: 9 }} onRefresh={vi.fn()} {...props} />
  </MemoryRouter>,
);

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('LobbyHub quick join and route behavior', () => {
  it('starts as a compact square status button and expands and collapses', () => {
    renderHub();
    const launcher = screen.getByRole('button', { name: /1 of 10 queued\. Expand lobby panel/ });
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(launcher.textContent).toContain('1/10');
    expect(screen.queryByText('OCE Inhouse')).toBeNull();
    fireEvent.click(launcher);
    expect(screen.getByRole('button', { name: 'Collapse lobby panel' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse lobby panel' }));
    expect(screen.getByRole('button', { name: /Expand lobby panel/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('updates the short status for ready checks, draft turns, live play, and offline snapshots', () => {
    const view = renderHub({ snapshot: { session: { id: 17, status: 'accepting' }, players: [{ ...player, account_id: 9, status: 'accepted' }] } });
    expect(screen.getByRole('button', { name: /Ready\. Expand lobby panel/ })).toBeTruthy();
    view.rerender(<MemoryRouter><LobbyHub snapshot={{ session: { id: 17, status: 'drafting', captain1_account_id: 9 }, draft: { currentPickerTeam: 1 }, players: [{ ...player, account_id: 9 }] }} accountId={9} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Your draft pick\. Expand lobby panel/ })).toBeTruthy();
    view.rerender(<MemoryRouter><LobbyHub snapshot={{ session: { id: 17, status: 'drafting', captain1_account_id: 9 }, draft: { complete: true, review: { approved: true } }, players: [] }} accountId={9} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Ready\. Expand lobby panel/ })).toBeTruthy();
    view.rerender(<MemoryRouter><LobbyHub snapshot={{ session: { id: 17, status: 'in_progress' }, players: [] }} accountId={9} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Live\. Expand lobby panel/ })).toBeTruthy();
    view.rerender(<MemoryRouter><LobbyHub snapshot={snapshot} accountId={9} stale /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Offline\. Expand lobby panel/ })).toBeTruthy();
  });

  it('requires at least one selected role before posting the join request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}));
    const refresh = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHub({ snapshot: { ...snapshot, players: [] }, onRefresh: refresh });

    fireEvent.click(screen.getByRole('button', { name: /Expand lobby panel/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick join' }));
    const dialog = screen.getByRole('dialog', { name: 'Where do you play?' });
    expect(within(dialog).getByRole('button', { name: 'Join queue' }).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /P2 Mid/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join queue' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/inhouse/17/join', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ preferredPositions: [2] }),
    }));
  });

  it('shows the expanded chat on /inhouse while preserving page chat and reminder content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ messages: [], canSend: true, canModerate: false })));
    render(
      <MemoryRouter initialEntries={['/inhouse']}>
        <LobbyHub snapshot={snapshot} accountId={42} steamUser={{ accountId: 42 }}><p>Reminder controls surface</p></LobbyHub>
        <LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand lobby panel/ }));
    expect(screen.getAllByRole('region', { name: 'Lobby chat' })).toHaveLength(2);
    expect(screen.getByText('/ 10 queued')).toBeTruthy();
    expect(screen.getByText('Reminder controls surface')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open lobby' })).toBeNull();
  });

  it('disables quick join when the queue snapshot is stale', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHub({ snapshot: { ...snapshot, players: [] }, stale: true });
    fireEvent.click(screen.getByRole('button', { name: /Expand lobby panel/ }));
    expect(screen.getByRole('button', { name: 'Refresh to join' }).disabled).toBe(true);
    expect(screen.getByText('Lobby details may be out of date. Refresh before joining.')).toBeTruthy();
  });

  it('marks collapsed attention accessibly and exposes the notice and acknowledgement when expanded', () => {
    const acknowledge = vi.fn();
    const notice = <div className="lh-attention" role="alert"><span>Attention needed</span><button onClick={acknowledge}>Acknowledge</button></div>;
    renderHub({ attention: notice });
    const launcher = screen.getByRole('button', { name: /Attention required\. Expand lobby panel/ });
    expect(launcher.querySelector('.lh-attention-indicator')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(launcher);
    expect(screen.getByRole('alert').textContent).toContain('Attention needed');
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it('shows server attention, the ten-player capacity, nicknames, and own queued status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ messages: [], canSend: true, canModerate: false })));
    renderHub({
      snapshot: { session: { id: 17, status: 'server_failed' }, players: [
        { account_id: 9, nickname: 'Rook', status: 'registered' },
        { account_id: 12, nickname: 'Morrow', status: 'accepted' },
      ] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Expand lobby panel/ }));
    expect(screen.getByText('Attention required')).toBeTruthy();
    expect(screen.getByText('2 / 10')).toBeTruthy();
    expect(screen.getByText('Rook')).toBeTruthy();
    expect(screen.getByText('Morrow')).toBeTruthy();
    expect(screen.getByText('You’re queued')).toBeTruthy();
    await act(async () => {});
  });

  it('closes the role selector on account/session change and ignores an old join failure', async () => {
    let resolveOldJoin;
    const fetchMock = vi.fn(() => new Promise(resolve => { resolveOldJoin = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const view = renderHub({ snapshot: { ...snapshot, players: [] } });
    fireEvent.click(screen.getByRole('button', { name: /Expand lobby panel/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick join' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /P1 Carry/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Join queue' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    view.rerender(
      <MemoryRouter>
        <LobbyHub snapshot={{ session: { id: 18, status: 'open' }, players: [] }} accountId={10} steamUser={{ accountId: 10 }} onRefresh={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Quick join' }));
    const newDialog = screen.getByRole('dialog', { name: 'Where do you play?' });
    await act(async () => resolveOldJoin(response({ error: 'Old lobby rejected the join.' }, false)));
    expect(screen.getByRole('dialog', { name: 'Where do you play?' })).toBe(newDialog);
    expect(screen.queryByText('Old lobby rejected the join.')).toBeNull();
  });

  it('rechecks queue phase and membership after opening the selector', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = renderHub({ snapshot: { ...snapshot, players: [] } });
    fireEvent.click(screen.getByRole('button', { name: /Expand lobby panel/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick join' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /P1 Carry/ }));
    view.rerender(
      <MemoryRouter>
        <LobbyHub snapshot={{ session: { id: 17, status: 'accepting' }, players: [{ account_id: 9, status: 'registered' }] }} accountId={9} steamUser={{ accountId: 9 }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Join queue' }).disabled).toBe(true);
    expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/join') && options?.method === 'POST')).toBe(false);
  });
});

describe('LobbyChat', () => {
  it('sends plain text and presents server send errors without replacing the transcript', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ messages: [{ id: 1, account_id: 42, display_name: 'Moss', body: 'Still here', created_at: '2025-01-01T00:00:00Z' }], canSend: true, canModerate: false }))
      .mockResolvedValueOnce(response({ error: 'Please wait before sending another message.' }, false));
    vi.stubGlobal('fetch', fetchMock);
    render(<LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed />);
    expect(await screen.findByText('Still here')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Need one more mid player' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Please wait before sending another message.');
    expect(screen.getByText('Still here')).toBeTruthy();
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ body: 'Need one more mid player' }));
  });

  it('aborts the prior request and never renders a delayed old-session response', async () => {
    let resolveOld;
    const fetchMock = vi.fn((url) => {
      if (url.includes('/17/chat')) return new Promise(resolve => { resolveOld = resolve; });
      return Promise.resolve(response({ messages: [{ id: 2, account_id: 42, display_name: 'Moss', body: 'New room', created_at: '2025-01-01T00:00:00Z' }], canSend: true, canModerate: false }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed />);
    view.rerender(<LobbyChat sessionId={18} accountId={42} sessionStatus="open" allowed />);
    expect(await screen.findByText('New room')).toBeTruthy();
    await act(async () => resolveOld(response({ messages: [{ id: 1, account_id: 42, display_name: 'Moss', body: 'Old room', created_at: '2024-01-01T00:00:00Z' }], canSend: true, canModerate: false })));
    expect(screen.queryByText('Old room')).toBeNull();
    expect(screen.getByText('New room')).toBeTruthy();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('clears transcript and sending permissions immediately when polling returns 403', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ messages: [{ id: 3, account_id: 42, display_name: 'Moss', body: 'Member text', created_at: '2025-01-01T00:00:00Z' }], canSend: true, canModerate: true }))
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Lobby membership required.' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed />);
    await act(async () => {});
    expect(screen.getByText('Member text')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByText('Member text')).toBeNull();
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.getByText('Lobby membership required.')).toBeTruthy();
  });

  it('guards concurrent submits and deduplicates a sent message when polling catches up', async () => {
    vi.useFakeTimers();
    let finishPost;
    const sent = { id: 15, account_id: 42, display_name: 'Moss', body: 'Ready', created_at: '2025-01-01T00:00:01Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ messages: [], canSend: true, canModerate: false }))
      .mockImplementationOnce(() => new Promise(resolve => { finishPost = resolve; }))
      .mockResolvedValueOnce(response({ messages: [sent], canSend: true, canModerate: false }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Ready' } });
    const form = screen.getByLabelText('Message').closest('form');
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock.mock.calls.filter(([url, options]) => options?.method === 'POST')).toHaveLength(1);
    await act(async () => finishPost(response({ message: sent })));
    expect(screen.getAllByText('Ready')).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getAllByText('Ready')).toHaveLength(1);
  });
});
