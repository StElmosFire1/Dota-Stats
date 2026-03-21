import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confirmBuyinSession } from '../api';

export default function BuyinSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState('loading');
  const [buyin, setBuyin] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setState('error');
      setError('No session ID found in URL.');
      return;
    }
    confirmBuyinSession(sessionId)
      .then(data => {
        setBuyin(data.buyin);
        setState('success');
      })
      .catch(err => {
        setState('error');
        setError(err.message || 'Failed to confirm payment.');
      });
  }, [sessionId]);

  return (
    <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
      {state === 'loading' && (
        <div className="card">
          <p style={{ color: 'var(--muted)', fontSize: 16 }}>Confirming your payment…</p>
        </div>
      )}

      {state === 'success' && buyin && (
        <div className="card">
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Payment Confirmed!</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
            Thanks <strong>{buyin.display_name}</strong>! Your buy-in of{' '}
            <strong>${(buyin.amount_cents / 100).toFixed(2)} AUD</strong> has been confirmed for the season.
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
            You're now part of the prize pool. Good luck!
          </p>
          <Link to="/seasons" className="btn btn-primary">
            View Prize Pool
          </Link>
        </div>
      )}

      {state === 'error' && (
        <div className="card">
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ marginTop: 0, color: 'var(--danger, #f87171)' }}>Something went wrong</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{error}</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
            If you completed a payment, it may still have been recorded. Check the prize pool or contact an admin.
          </p>
          <Link to="/seasons" className="btn">
            Back to Seasons
          </Link>
        </div>
      )}
    </div>
  );
}
