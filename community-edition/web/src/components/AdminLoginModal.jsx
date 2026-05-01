import React, { useState, useEffect, useRef } from 'react';
import { useAdmin } from '../context/AdminContext';

export default function AdminLoginModal() {
  const { showModal, setShowModal, login } = useAdmin();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (showModal) {
      setPassword('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showModal]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setShowModal(false); };
    if (showModal) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal, setShowModal]);

  if (!showModal) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(password);
    setLoading(false);
    if (!result.success) setError(result.error);
  };

  return (
    <div className="modal-overlay" onClick={() => setShowModal(false)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Admin Login</span>
          <button className="modal-close" onClick={() => setShowModal(false)}>&#x2715;</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            ref={inputRef}
            type="password"
            className="form-input"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && <div style={{ color: 'var(--dire-color)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading || !password}>
            {loading ? 'Checking…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
