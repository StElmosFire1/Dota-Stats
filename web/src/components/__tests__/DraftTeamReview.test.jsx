import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DraftTeamReview from '../DraftTeamReview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const players = [
  { account_id: 1, team: 1, captain: true, nickname: 'Mako', display_name: 'Steam Mako', inhouse_mmr: 3200 },
  { account_id: 2, team: 1, nickname: 'Fern', display_name: 'Fern persona', inhouse_mmr: 2900 },
  { account_id: 3, team: 1, display_name: 'Kite', inhouse_mmr: 2700 },
  { account_id: 4, team: 1, display_name: 'Rook', inhouse_mmr: 2400 },
  { account_id: 5, team: 1, display_name: 'Vale', inhouse_mmr: 2100 },
  { account_id: 6, team: 2, captain: true, display_name: 'North', inhouse_mmr: 3100 },
  { account_id: 7, team: 2, display_name: 'South', inhouse_mmr: 2800 },
  { account_id: 8, team: 2, display_name: 'East', inhouse_mmr: 2600 },
  { account_id: 9, team: 2, display_name: 'West', inhouse_mmr: 2300 },
  { account_id: 10, team: 2, display_name: 'Harbor', inhouse_mmr: 2000 },
];

const suggestion = {
  team1AccountId: 2,
  team2AccountId: 7,
  beforeGap: 180,
  afterGap: 40,
  improvement: 140,
};

function makeReview(overrides = {}) {
  return {
    revision: 12,
    available: true,
    approved: false,
    confirmations: [],
    pendingTrade: null,
    suggestions: [suggestion],
    balance: {
      metric: 'inhouse_mmr',
      knownCount: 10,
      totalCount: 10,
      team1Average: 2700,
      team2Average: 2600,
      gap: 100,
    },
    ...overrides,
  };
}

function mockPost({ status = 200, body = { review: makeReview() } } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mount({ captainTeam = null, review = makeReview(), onChanged = vi.fn() } = {}) {
  const view = render(
    <DraftTeamReview
      sessionId="session-84"
      review={review}
      players={players}
      captainTeam={captainTeam}
      captainAccountIds={[1, 6]}
      onChanged={onChanged}
    />,
  );
  return { ...view, onChanged };
}

describe('DraftTeamReview', () => {
  it('keeps spectators read-only', () => {
    mount();
    expect(screen.getByText('Read-only for spectators')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm teams' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Propose trade' }).disabled).toBe(true);
    expect(screen.getByLabelText('Green side player').disabled).toBe(true);
  });

  it('posts the current captain confirmation and revision, then refreshes review state', async () => {
    const fetchMock = mockPost();
    const onChanged = vi.fn().mockResolvedValue(undefined);
    mount({ captainTeam: 1, onChanged });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm teams' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/inhouse/session-84/draft-review', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', revision: 12 }),
    }));
  });

  it('fills a suggested proposal without mutating, then posts the selected player ids', async () => {
    const fetchMock = mockPost();
    mount({ captainTeam: 1 });

    fireEvent.click(screen.getByRole('button', { name: /Fern ↔ South/ }));
    expect(screen.getByLabelText('Green side player').value).toBe('2');
    expect(screen.getByLabelText('Red side player').value).toBe('7');
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Propose trade' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toEqual({
      action: 'propose',
      revision: 12,
      team1AccountId: 2,
      team2AccountId: 7,
    });
  });

  it('shows accept and decline only to the opposing captain', async () => {
    const pendingTrade = {
      id: 'trade-3',
      proposedByTeam: 1,
      team1AccountId: 2,
      team2AccountId: 7,
    };
    const fetchMock = mockPost();
    mount({ captainTeam: 2, review: makeReview({ pendingTrade }) });

    expect(screen.getByRole('button', { name: 'Accept swap' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Withdraw proposal' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Accept swap' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'accept',
      revision: 12,
      proposalId: 'trade-3',
    });
  });

  it('shows withdrawal only to the proposing captain', async () => {
    const pendingTrade = {
      id: 'trade-4',
      proposedByTeam: 1,
      team1AccountId: 2,
      team2AccountId: 7,
    };
    const fetchMock = mockPost();
    mount({ captainTeam: 1, review: makeReview({ pendingTrade }) });

    expect(screen.queryByRole('button', { name: 'Accept swap' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw proposal' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'withdraw',
      revision: 12,
      proposalId: 'trade-4',
    });
  });

  it('renders approved review as final and immutable', () => {
    const fetchMock = mockPost();
    mount({
      captainTeam: 1,
      review: makeReview({ approved: true, confirmations: [1, 2] }),
    });

    expect(screen.getByText(/Team review is final and the teams are locked/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm teams' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke confirmation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Propose trade' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a server conflict response', async () => {
    mockPost({ status: 409, body: { error: 'Review revision is stale. Refresh and try again.' } });
    mount({ captainTeam: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm teams' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review revision is stale. Refresh and try again.');
  });

  it('shows incomplete rating data honestly without treating missing ratings as zero', () => {
    mount({
      review: makeReview({
        balance: {
          metric: 'inhouse_mmr',
          knownCount: 3,
          totalCount: 10,
          team1Average: null,
          team2Average: null,
          gap: null,
        },
        suggestions: [],
      }),
    });

    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('3 of 10 player ratings known')).toBeTruthy();
    expect(screen.getByText('Green average: Not rated · Red average: Not rated')).toBeTruthy();
    expect(screen.getByText(/Incomplete ratings; averages and gap may not represent every player/)).toBeTruthy();
  });

  it('limits rating ideas to the best three supplied suggestions', () => {
    const fourSuggestions = [
      suggestion,
      { ...suggestion, team1AccountId: 3, team2AccountId: 8 },
      { ...suggestion, team1AccountId: 4, team2AccountId: 9 },
      { ...suggestion, team1AccountId: 5, team2AccountId: 10 },
    ];
    mount({ review: makeReview({ suggestions: fourSuggestions }) });

    expect(screen.getByRole('button', { name: /Fern ↔ South/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kite ↔ East/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rook ↔ West/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Vale ↔ Harbor/ })).toBeNull();
  });
});
