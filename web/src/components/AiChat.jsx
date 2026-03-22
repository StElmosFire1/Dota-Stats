import React, { useState, useRef, useEffect } from 'react';

const BASE = '/api';

async function sendMessage(message, history) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Chat failed');
  return data.reply;
}

const SUGGESTED = [
  'Who is the best player right now?',
  'What heroes have the best win rate?',
  'Suggest a draft against heavy carries',
  'Tips for playing position 4?',
];

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "G'day! I'm GrokBot 🤖 — ask me about the leaderboard, hero picks, draft tips, or anything Dota 2 related." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, loading]);

  const getHistory = () =>
    messages
      .filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0)
      .map(m => ({ role: m.role, content: m.content }));

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setError(null);
    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = getHistory();
      const reply = await sendMessage(msg, history);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Chat with GrokBot"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 54, height: 54, borderRadius: '50%',
          background: open ? 'var(--bg-card)' : 'var(--accent)',
          border: '2px solid var(--accent)',
          color: open ? 'var(--accent)' : '#fff',
          fontSize: 24, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          transition: 'all 0.2s',
        }}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 24, zIndex: 999,
          width: 360, maxWidth: 'calc(100vw - 48px)',
          height: 500, maxHeight: 'calc(100vh - 120px)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg-hover)',
          }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>GrokBot</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dota 2 stats & strategy assistant</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '9px 13px',
                  borderRadius: m.role === 'user'
                    ? '16px 16px 4px 16px'
                    : '16px 16px 16px 4px',
                  background: m.role === 'user'
                    ? 'var(--accent)'
                    : 'var(--bg-hover)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '9px 14px', borderRadius: '16px 16px 16px 4px',
                  background: 'var(--bg-hover)', fontSize: 13, color: 'var(--text-muted)',
                  display: 'flex', gap: 4, alignItems: 'center',
                }}>
                  <TypingDots />
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: 10,
                background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.3)',
                color: 'var(--accent-red)', fontSize: 12,
              }}>
                {error}
              </div>
            )}

            {/* Suggestions — only shown on the first message */}
            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {SUGGESTED.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    style={{
                      textAlign: 'left', padding: '7px 12px',
                      background: 'var(--bg-hover)', border: '1px solid var(--border)',
                      borderRadius: 10, cursor: 'pointer',
                      color: 'var(--text-secondary)', fontSize: 12,
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about stats, drafts, heroes…"
              rows={1}
              maxLength={500}
              style={{
                flex: 1, resize: 'none', padding: '8px 12px',
                borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg-hover)', color: 'var(--text-primary)',
                fontSize: 13, lineHeight: 1.4, outline: 'none',
                fontFamily: 'inherit',
                maxHeight: 100, overflowY: 'auto',
              }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              style={{
                padding: '8px 14px', borderRadius: 10,
                background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: input.trim() && !loading ? '#fff' : 'var(--text-muted)',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                fontSize: 18, flexShrink: 0, transition: 'all 0.15s',
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--text-muted)',
            display: 'inline-block',
            animation: `dotBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}
