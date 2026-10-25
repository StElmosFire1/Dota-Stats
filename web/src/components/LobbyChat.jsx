import React, { useCallback, useEffect, useRef, useState } from 'react';
import './lobby-hub.css';

const CLOSED = new Set(['completed', 'cancelled']);

function chronologicalUnique(messages) {
  const unique = new Map();
  for (const message of messages) {
    if (message?.id != null) unique.set(String(message.id), message);
  }
  return [...unique.values()].sort((a, b) => {
    const dateOrder = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (Number.isFinite(dateOrder) && dateOrder !== 0) return dateOrder;
    const aId = Number(a.id);
    const bId = Number(b.id);
    if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
    return String(a.id).localeCompare(String(b.id));
  });
}

export default function LobbyChat({ sessionId, accountId, sessionStatus, allowed = false }) {
  const [messages, setMessages] = useState([]);
  const [canSend, setCanSend] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stateKey, setStateKey] = useState(`${accountId ?? ''}:${sessionId ?? ''}`);
  const listRef = useRef(null);
  const bottomRef = useRef(true);
  const outstanding = useRef(new Set());
  const sendLock = useRef(false);
  const localMessages = useRef(new Map());
  const deniedKey = useRef(null);
  const active = useRef(true);
  const latestRequestKey = useRef(`${accountId ?? ''}:${sessionId ?? ''}`);
  const requestKey = `${accountId ?? ''}:${sessionId ?? ''}`;
  latestRequestKey.current = requestKey;
  const sessionReady = stateKey === requestKey;
  const canSendNow = sessionReady && canSend && !CLOSED.has(sessionStatus);

  const read = useCallback(async (signal, expectedId, expectedKey) => {
    const response = await fetch(`/api/inhouse/${expectedId}/chat`, {
      credentials: 'include', cache: 'no-store', signal,
    });
    if (!response.ok && [401, 403].includes(response.status) && active.current && latestRequestKey.current === expectedKey) {
      localMessages.current.clear();
      deniedKey.current = expectedKey;
      setMessages([]);
      setCanSend(false);
      setCanModerate(false);
      setError('Chat access is no longer available.');
      setLoading(false);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Chat unavailable (${response.status})`);
      error.status = response.status;
      if ([401, 403].includes(response.status) && active.current && latestRequestKey.current === expectedKey) {
        setError(error.message);
      }
      throw error;
    }
    if (!active.current || latestRequestKey.current !== expectedKey) return;
    deniedKey.current = null;
    const node = listRef.current;
    const wasAtBottom = !node || node.scrollHeight - node.scrollTop - node.clientHeight < 40;
    const incoming = Array.isArray(data.messages) ? data.messages : [];
    incoming.forEach(message => localMessages.current.delete(String(message.id)));
    setMessages(chronologicalUnique([...incoming, ...localMessages.current.values()]).slice(-50));
    setCanSend(!!data.canSend);
    setCanModerate(!!data.canModerate);
    setError('');
    setLoading(false);
    bottomRef.current = wasAtBottom;
  }, []);

  useEffect(() => {
    setStateKey(requestKey);
    setMessages([]);
    setCanSend(false);
    setCanModerate(false);
    setError('');
    setLoading(true);
    setSending(false);
    setBody('');
    localMessages.current.clear();
    deniedKey.current = null;
    sendLock.current = false;
    if (!sessionId || !allowed || !accountId) {
      setLoading(false);
      return undefined;
    }
    active.current = true;
    let disposed = false;
    let pending = null;
    let polling = false;
    const poll = async () => {
      if (polling || disposed) return;
      polling = true;
      pending = new AbortController();
      try {
        await read(pending.signal, sessionId, requestKey);
      } catch (e) {
        if (!disposed && e.name !== 'AbortError' && latestRequestKey.current === requestKey) {
          setError(e.message);
          setLoading(false);
        }
      } finally {
        polling = false;
      }
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      disposed = true;
      active.current = false;
      pending?.abort();
      outstanding.current.forEach(controller => controller.abort());
      outstanding.current.clear();
      window.clearInterval(timer);
    };
  }, [sessionId, accountId, allowed, read, requestKey]);

  useEffect(() => {
    if (bottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text || !canSendNow || sending || sendLock.current || deniedKey.current === requestKey || !sessionId) return;
    sendLock.current = true;
    const expectedId = sessionId;
    const expectedKey = requestKey;
    const controller = new AbortController();
    outstanding.current.add(controller);
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/inhouse/${expectedId}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Message not sent (${response.status})`);
      if (!active.current || latestRequestKey.current !== expectedKey || deniedKey.current === expectedKey) return;
      setBody('');
      if (data.message) {
        localMessages.current.set(String(data.message.id), data.message);
        setMessages(current => chronologicalUnique([...current, data.message]).slice(-50));
        bottomRef.current = true;
      }
    } catch (e) {
      if (e.name !== 'AbortError' && active.current && latestRequestKey.current === expectedKey) setError(e.message);
    } finally {
      outstanding.current.delete(controller);
      if (active.current && latestRequestKey.current === expectedKey) {
        sendLock.current = false;
        setSending(false);
      }
    }
  }

  async function removeMessage(messageId) {
    const expectedId = sessionId;
    const expectedKey = requestKey;
    const controller = new AbortController();
    outstanding.current.add(controller);
    try {
      const response = await fetch(`/api/inhouse/${expectedId}/chat/${messageId}`, {
        method: 'DELETE', credentials: 'include', signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Message could not be removed.');
      if (active.current && latestRequestKey.current === expectedKey && deniedKey.current !== expectedKey) {
        localMessages.current.delete(String(messageId));
        setMessages(current => current.filter(m => String(m.id) !== String(messageId)));
      }
    } catch (e) {
      if (e.name !== 'AbortError' && active.current && latestRequestKey.current === expectedKey) setError(e.message);
    } finally {
      outstanding.current.delete(controller);
    }
  }

  if (!sessionId || !allowed || !accountId) return null;
  return (
    <section className="lh-chat" aria-label="Lobby chat">
      <header className="lh-chat-heading">
        <div><span className="lh-kicker">Match room</span><h3>Lobby chat</h3></div>
        <span className="lh-live-dot" aria-label="Updates every five seconds" />
      </header>
      {loading || !sessionReady ? <div className="lh-chat-skeleton" aria-label="Loading chat"><i /><i /><i /></div> : (
        <div className="lh-chat-list" ref={listRef} onScroll={e => {
          const n = e.currentTarget;
          bottomRef.current = n.scrollHeight - n.scrollTop - n.clientHeight < 40;
        }}>
          {messages.length ? messages.map(message => (
            <article className="lh-message" key={message.id}>
              <div className="lh-message-meta"><strong>{message.display_name || `Player ${message.account_id}`}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                {canModerate && <button className="lh-icon-button" type="button" aria-label={`Delete message from ${message.display_name || 'player'}`} onClick={() => removeMessage(message.id)}>Remove</button>}
              </div>
              <p>{message.body}</p>
            </article>
          )) : <p className="lh-chat-empty">The room is quiet. Start the conversation.</p>}
        </div>
      )}
      {sessionReady && error && <p className="lh-inline-error" role="status">{error}</p>}
      {canSendNow ? (
        <form className="lh-chat-form" onSubmit={send}>
          <label className="lh-visually-hidden" htmlFor={`lobby-chat-${sessionId}`}>Message</label>
          <textarea id={`lobby-chat-${sessionId}`} value={body} rows={2} placeholder="Say something useful…" onChange={e => setBody(Array.from(e.target.value).slice(0, 500).join(''))} />
          <div className="lh-chat-submit"><span>{Array.from(body).length}/500</span><button type="submit" disabled={sending || !body.trim()}>{sending ? 'Sending…' : 'Send'}</button></div>
        </form>
      ) : <p className="lh-chat-closed">{CLOSED.has(sessionStatus) ? 'Chat is closed for this match.' : 'Chat is read-only.'}</p>}
    </section>
  );
}
