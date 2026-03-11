import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUploadStatus } from '../api';

const MAX_RETRIES = 10;

export default function UploadIndicator() {
  const [job, setJob] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const cancelledRef = useRef(false);
  const pollingRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  const clearJob = useCallback(() => {
    sessionStorage.removeItem('uploadJobId');
    cancelledRef.current = true;
    pollingRef.current = false;
  }, []);

  const pollJob = useCallback((id, retries = 0) => {
    if (cancelledRef.current || pollingRef.current) return;
    pollingRef.current = true;

    const poll = async () => {
      if (cancelledRef.current) { pollingRef.current = false; return; }

      try {
        const data = await getUploadStatus(id);
        retries = 0;

        if (data.status === 'complete') {
          setJob({ status: 'complete', matchId: data.matchId, players: data.players });
          clearJob();
          setDismissed(false);
          return;
        }

        if (data.status === 'error') {
          setJob({ status: 'error', error: data.error });
          clearJob();
          setDismissed(false);
          return;
        }

        setJob({ status: 'processing', step: data.step || 'Processing...' });

        if (!cancelledRef.current) {
          setTimeout(() => { pollingRef.current = false; pollJob(id, 0); }, 2000);
        } else {
          pollingRef.current = false;
        }
      } catch {
        if (cancelledRef.current) { pollingRef.current = false; return; }
        if (retries >= MAX_RETRIES) {
          setJob({ status: 'error', error: 'Lost connection to server' });
          clearJob();
          pollingRef.current = false;
          return;
        }
        const delay = Math.min(2000 * Math.pow(1.5, retries), 15000);
        setTimeout(() => { pollingRef.current = false; pollJob(id, retries + 1); }, delay);
      }
    };

    poll();
  }, [clearJob]);

  useEffect(() => {
    const checkForJob = () => {
      const savedJobId = sessionStorage.getItem('uploadJobId');
      if (savedJobId && !pollingRef.current) {
        cancelledRef.current = false;
        setJob(prev => prev || { status: 'processing', step: 'Processing...' });
        setDismissed(false);
        pollJob(savedJobId);
      } else if (!savedJobId && job && job.status === 'processing') {
        setJob(null);
      }
    };

    checkForJob();
    const interval = setInterval(checkForJob, 3000);

    return () => {
      clearInterval(interval);
      cancelledRef.current = true;
      pollingRef.current = false;
    };
  }, [pollJob]);

  if (location.pathname === '/upload') return null;
  if (!job || dismissed) return null;

  const handleDismiss = (e) => {
    e.stopPropagation();
    setDismissed(true);
    if (job.status !== 'processing') setJob(null);
  };

  if (job.status === 'processing') {
    return (
      <div className="upload-indicator processing" onClick={() => navigate('/upload')}>
        <span className="indicator-dot pulsing"></span>
        <span>{job.step || 'Processing replay...'}</span>
      </div>
    );
  }

  if (job.status === 'complete') {
    return (
      <div className="upload-indicator success">
        <span className="indicator-dot"></span>
        <span
          className="indicator-link"
          onClick={() => {
            setJob(null);
            navigate(`/match/${job.matchId}`);
          }}
        >
          Match recorded ({job.players} players) — click to view
        </span>
        <button className="indicator-dismiss" onClick={handleDismiss}>&times;</button>
      </div>
    );
  }

  if (job.status === 'error') {
    return (
      <div className="upload-indicator error">
        <span className="indicator-dot"></span>
        <span
          className="indicator-link"
          onClick={() => {
            setJob(null);
            navigate('/upload');
          }}
        >
          Upload failed: {job.error}
        </span>
        <button className="indicator-dismiss" onClick={handleDismiss}>&times;</button>
      </div>
    );
  }

  return null;
}
