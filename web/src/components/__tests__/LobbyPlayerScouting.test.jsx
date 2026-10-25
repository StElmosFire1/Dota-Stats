import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LobbyPlayerScouting from '../LobbyPlayerScouting';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../lib/lobbyPlayerScouting', () => ({ loadLobbyPlayerScouting: load }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('lobby player scouting', () => {
  it('shows heroes, a real profile preference, custom title, roles and recent performances', async () => {
    load.mockResolvedValue({
      customTitle: 'The Captain',
      bestHeroes: [{ hero_id: 5, games: 10, winRate: 70 }],
      comfortHeroes: [{ hero_id: 1, games: 20, winRate: 60 }],
      preferredHero: 5, preferredHeroCaption: 'My favourite',
      recentRoles: [{ position: 2, games: 3 }], recentSample: 3,
      recentMatches: [{ match_id: '123', hero_id: 5, position: 2, kills: 12, deaths: 3, assists: 19, gpm: 543, won: true }],
    });
    render(<LobbyPlayerScouting accountId="42" />);
    expect(await screen.findByText('The Captain')).toBeTruthy();
    expect(screen.getByText('Mid (3)')).toBeTruthy();
    expect(screen.getByText('12/3/19')).toBeTruthy();
    expect(screen.getByText('70% · 10 games')).toBeTruthy();
    expect(screen.getByText(/most played, not a declared preference/)).toBeTruthy();
    expect(screen.getByText(/My favourite/)).toBeTruthy();
    expect(load).toHaveBeenCalledWith('42');
  });

  it('explains an empty history instead of filling it with sample stats', async () => {
    load.mockResolvedValue({ bestHeroes: [], comfortHeroes: [], recentMatches: [], recentRoles: [], recentSample: 0 });
    render(<LobbyPlayerScouting accountId="42" />);
    expect(await screen.findByText('No recent matches recorded.')).toBeTruthy();
    expect(screen.getByText('No hero history recorded.')).toBeTruthy();
    expect(screen.getByText('No recent role data.')).toBeTruthy();
  });

  it('shows an explicit failure state and does not fetch for a fleeting hover', async () => {
    load.mockRejectedValue(new Error('Scouting unavailable.'));
    const first = render(<LobbyPlayerScouting accountId="42" />);
    first.unmount();
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(load).not.toHaveBeenCalled();
    render(<LobbyPlayerScouting accountId="43" />);
    expect(await screen.findByText('Scouting unavailable.')).toBeTruthy();
  });
});
