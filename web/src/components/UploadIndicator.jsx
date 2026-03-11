import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUploadStatus } from '../api';

const MAX_RETRIES = 10;
const STORAGE_KEY = 'uploadQueue';

function getQueueFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function updateQueueItemInStorage(id, updates) {
  try {
    const queue = getQueueFromStorage();
    const updated = queue.map(item => item.id === id ? { ...item, ...updates } : item);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch { return []; }
}

export default function UploadIndicator() {
  const [summary, setSummary] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const pollingRef = useRef(new Set());
  const timerIdsRef = useRef(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  const isOnUploadPage = location.pathname === '/upload';

  const safeTimeout = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timerIdsRef.current.delete(id);
      fn();
    }, ms);
    timerIdsRef.current.add(id);
    return id;
  }, []);

  const refreshSummary = useCallback(() => {
    const queue = getQueueFromStorage();
    if (queue.length === 0) { setSummary(null); return; }

    const active = queue.filter(i => i.status === 'processing' || i.status === 'uploading');
    const pending = queue.filter(i => i.status === 'pending');
    const completed = queue.filter(i => i.status === 'complete');
    const failed = queue.filter(i => i.status === 'error' || i.status === 'lost');

    if (active.length === 0 && pending.length === 0) {
      if (completed.length > 0 || failed.length > 0) {
        setSummary({ status: 'done', completed: completed.length, failed: failed.length,
          lastMatchId: completed.length > 0 ? completed[completed.length - 1].result?.matchId : null });
      } else {
        setSummary(null);
      }
      return;
    }

    const total = queue.length;
    const doneCount = completed.length + failed.length;
    const parsing = active.filter(i => i.status === 'processing');
    const uploading = active.filter(i => i.status === 'uploading');
    let step;
    if (uploading.length > 0 && parsing.length > 0) {
      step = `Uploading ${uploading.length}, parsing ${parsing.length}`;
    } else if (uploading.length > 0) {
      step = `Uploading ${uploading.length} file${uploading.length > 1 ? 's' : ''}`;
    } else if (parsing.length > 0) {
      step = `Parsing ${parsing.length} file${parsing.length > 1 ? 's' : ''}`;
    } else {
      step = `${pending.length} file${pending.length > 1 ? 's' : ''} waiting`;
    }
    setSummary({
      status: 'active',
      step,
      doneCount,
      total,
    });
  }, []);

  const pollProcessingJobs = useCallback(() => {
    const queue = getQueueFromStorage();
    const processing = queue.filter(i => i.status === 'processing' && i.jobId);

    for (const item of processing) {
      if (pollingRef.current.has(item.jobId)) continue;
      pollingRef.current.add(item.jobId);

      let retries = 0;
      const poll = async () => {
        try {
          const job = await getUploadStatus(item.jobId);
          retries = 0;

          if (job.step) {
            updateQueueItemInStorage(item.id, { progress: { percent: 95, detail: job.step } });
            refreshSummary();
          }

          if (job.status === 'complete') {
            updateQueueItemInStorage(item.id, {
              status: 'complete',
              progress: { percent: 100, detail: 'Complete!' },
              result: { matchId: job.matchId, players: job.players },
            });
            pollingRef.current.delete(item.jobId);
            setDismissed(false);
            refreshSummary();
            return;
          }

          if (job.status === 'error') {
            updateQueueItemInStorage(item.id, { status: 'error', error: job.error, progress: null });
            pollingRef.current.delete(item.jobId);
            setDismissed(false);
            refreshSummary();
            return;
          }

          safeTimeout(poll, 2000);
        } catch {
          retries++;
          if (retries >= MAX_RETRIES) {
            updateQueueItemInStorage(item.id, { status: 'error', error: 'Lost connection', progress: null });
            pollingRef.current.delete(item.jobId);
            refreshSummary();
            return;
          }
          safeTimeout(poll, Math.min(2000 * Math.pow(1.5, retries), 15000));
        }
      };

      poll();
    }
  }, [refreshSummary, safeTimeout]);

  useEffect(() => {
    refreshSummary();

    if (!isOnUploadPage) {
      pollProcessingJobs();
    }

    const interval = setInterval(() => {
      refreshSummary();
      if (!isOnUploadPage) {
        pollProcessingJobs();
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      for (const id of timerIdsRef.current) clearTimeout(id);
      timerIdsRef.current.clear();
      pollingRef.current.clear();
    };
  }, [refreshSummary, pollProcessingJobs, isOnUploadPage]);

  if (isOnUploadPage) return null;
  if (!summary || dismissed) return null;

  const handleDismiss = (e) => {
    e.stopPropagation();
    setDismissed(true);
  };

  if (summary.status === 'active') {
    return (
      <div className="upload-indicator processing" onClick={() => navigate('/upload')}>
        <span className="indicator-dot pulsing"></span>
        <span>{summary.step} ({summary.doneCount}/{summary.total} done)</span>
      </div>
    );
  }

  if (summary.status === 'done') {
    return (
      <div className="upload-indicator success">
        <span className="indicator-dot"></span>
        <span
          className="indicator-link"
          onClick={() => {
            setDismissed(true);
            if (summary.lastMatchId) {
              navigate(`/match/${summary.lastMatchId}`);
            } else {
              navigate('/upload');
            }
          }}
        >
          {summary.completed} replay{summary.completed !== 1 ? 's' : ''} done
          {summary.failed > 0 && `, ${summary.failed} failed`}
           — click to view
        </span>
        <button className="indicator-dismiss" onClick={handleDismiss}>&times;</button>
      </div>
    );
  }

  return null;
}
