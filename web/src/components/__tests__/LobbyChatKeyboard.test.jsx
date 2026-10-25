import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LobbyChat from '../LobbyChat';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({
    ok: true,
    json: async () => options?.method === 'POST'
      ? { message: { id: 1, body: JSON.parse(options.body).body, display_name: 'Player', created_at: new Date().toISOString() } }
      : { messages: [], canSend: true },
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mount() {
  render(<LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed />);
  return screen.findByLabelText('Message');
}
it('sends on Enter and retains a single send through repeated key events', async () => {
  const input = await mount();
  fireEvent.change(input, { target: { value: 'Ready to play' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByText('Ready to play');
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(input.value).toBe('');
});
it('allows Shift+Enter and composition without sending, and ignores empty Enter', async () => {
  const input = await mount();
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.change(input, { target: { value: 'First line' } });
  const shifted = fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  const composing = fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  expect(shifted).toBe(true);
  expect(composing).toBe(true);
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});
it('keeps independent accessible inputs for the page and expanded widget', async () => {
  render(<><LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed /><LobbyChat sessionId={17} accountId={42} sessionStatus="open" allowed /></>);
  await waitFor(() => expect(screen.getAllByLabelText('Message')).toHaveLength(2));
  const inputs = screen.getAllByLabelText('Message');
  expect(inputs[0].id).not.toBe(inputs[1].id);
});
