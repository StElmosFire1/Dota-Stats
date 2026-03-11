import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUploadStatus } from '../api';

const MAX_RETRIES = 5;

export default function UploadIndicator() {
  const [job, setJob] = useState(null);
  const cancelledRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  const clearJob = useCallback(() => {
    sessionStorage.removeItem('uploadJobId');
    cancelledRef.current = true;
  }, []);

  const pollJob = useCallback((id, retries = 0) => {
    if (cancelledRef.current) return;

    const poll = async () => {
      try {
        const data = await getUploadStatus(id);
        retries = 0;

        if (data.status === 'complete') {
          setJob({ status: 'complete', matchId: data.matchId });
          clearJob();
          return;
        }

        if (data.status === 'error') {
          setJob({ status: 'error', error: data.error });
          clearJob();
          return;
        }

        if (!cancelledRef.current) {
          setTimeout(() => pollJob(id, 0), 3000);
        }
      } catch {
        if (cancelledRef.current) return;
        if (retries >= MAX_RETRIES) {
          setJob({ status: 'error', error: 'Lost connection' });
          clearJob();
          return;
        }
        const delay = Math.min(3000 * Math.pow(2, retries), 30000);
        setTimeout(() => pollJob(id, retries + 1), delay);
      }
    };

    poll();
  }, [clearJob]);

  useEffect(() => {
    const checkForJob = () => {
      const savedJobId = sessionStorage.getItem('uploadJobId');
      if (savedJobId && (!job || job.status === 'processing')) {
        cancelledRef.current = false;
        setJob({ status: 'processing' });
        pollJob(savedJobId);
      }
    };

    checkForJob();

    const onStorage = (e) => {
      if (e.key === 'uploadJobId') checkForJob();
    };
    window.addEventListener('storage', onStorage);

    const interval = setInterval(checkForJob, 2000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
  }, [pollJob, job]);

  if (location.pathname === '/upload') return null;
  if (!job) return null;

  if (job.status === 'processing') {
    return (
      <div className="upload-indicator processing" onClick={() => navigate('/upload')}>
        <span className="indicator-dot pulsing"></span>
        <span>Parsing replay...</span>
      </div>
    );
  }

  if (job.status === 'complete') {
    return (
      <div className="upload-indicator success" onClick={() => {
        setJob(null);
        navigate(`/match/${job.matchId}`);
      }}>
        <span className="indicator-dot"></span>
        <span>Match recorded — click to view</span>
      </div>
    );
  }

  if (job.status === 'error') {
    return (
      <div className="upload-indicator error" onClick={() => {
        setJob(null);
        navigate('/upload');
      }}>
        <span className="indicator-dot"></span>
        <span>Upload failed — click for details</span>
      </div>
    );
  }

  return null;
}
