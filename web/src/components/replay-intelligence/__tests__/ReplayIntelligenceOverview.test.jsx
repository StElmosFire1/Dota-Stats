import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReplayIntelligenceOverview from '../ReplayIntelligenceOverview';

describe('ReplayIntelligenceOverview', () => {
  it('renders the intelligence payload and timestamped replay evidence', () => {
    render(
      <MemoryRouter>
        <ReplayIntelligenceOverview
          matchId="42"
          publicContext
          intelligence={{
            draft: { sequence: [{ heroId: 1, action: 'pick' }] },
            fights: [{ start_s: 125, summary: 'Radiant won the river fight' }],
            objectiveLog: [{ t: 240, type: 'roshan' }],
            coaching: { playerMetrics: [{ slot: 0 }] },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'What shaped this match' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('Coaching')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inspect evidence' }));
    const link = screen.getByRole('link', { name: /Radiant won the river fight/ });
    expect(link).toHaveAttribute('href', '/replay/42?t=125');
  });
});