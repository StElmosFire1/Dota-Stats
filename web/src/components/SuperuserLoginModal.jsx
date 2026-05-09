import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import Dialog from './Dialog';

export default function SuperuserLoginModal() {
  const { showModal, setShowModal, login } = useSuperuser();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (showModal) {
      setPassword('');
      setError('');
    }
  }, [showModal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(password);
    setLoading(false);
    if (result.success) {
      setShowModal(false);
      navigate('/admin');
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={showModal}
      onClose={() => setShowModal(false)}
      labelledBy="superuser-login-title"
      initialFocusRef={inputRef}
      backdropClassName="modal-overlay"
      contentClassName="modal-box"
    >
      <div className="modal-header">
        <span className="modal-title" id="superuser-login-title">&#128081; Superuser Login</span>
        <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Close">&#x2715;</button>
      </div>
      <p style={{ color: '#888', fontSize: '0.85rem', margin: '0 0 12px' }}>
        Full stats editing access. Requires a separate superuser password.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          ref={inputRef}
          type="password"
          className="form-input"
          placeholder="Superuser password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <div style={{ color: 'var(--dire-color)', fontSize: 13 }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={loading || !password}>
          {loading ? 'Checking…' : 'Login'}
        </button>
      </form>
    </Dialog>
  );
}
