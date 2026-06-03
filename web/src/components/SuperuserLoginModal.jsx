import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import Dialog from './Dialog';

export default function SuperuserLoginModal() {
  const { showModal, setShowModal, login } = useSuperuser();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (showModal) {
      setError('');
    }
  }, [showModal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await login();
      if (result.success) {
        setShowModal(false);
        navigate('/admin');
      } else {
        setError(result.error);
      }
    } catch (_) {
      setError('Login failed unexpectedly — please reload and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={showModal}
      onClose={() => setShowModal(false)}
      labelledBy="superuser-login-title"
      initialFocusRef={buttonRef}
      backdropClassName="modal-overlay"
      contentClassName="modal-box"
    >
      <div className="modal-header">
        <span className="modal-title" id="superuser-login-title">&#128081; Superuser Access</span>
        <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Close">&#x2715;</button>
      </div>
      <p style={{ color: '#888', fontSize: '0.85rem', margin: '0 0 12px' }}>
        Full stats editing access. No password — access is linked to your Steam
        account. You must be signed in with an authorised Steam account; if you
        are, just continue.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ color: 'var(--dire-color)', fontSize: 13 }}>{error}</div>}
        <button ref={buttonRef} type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Checking…' : 'Continue as superuser'}
        </button>
      </form>
    </Dialog>
  );
}
