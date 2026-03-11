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

function updateQueueItem(id, updates) {
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
  const cancelledRef = useRef(false);
  const pollingRef = useRef(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  const refreshSummary = useCallback(() => {
    const queue = getQueueFromStorage();
    if (queue.length === 0) { setSummary(null); return; }

    const active = queue.filter(i => i.status === 'processing' || i.status === 'uploading');
    const pending = queue.filter(i => i.status === 'pending');
    const completed = queue.filter(i => i.status === 'complete');
    const failed = queue.filter(i => i.status === 'error');

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
    const currentItem = active[0];
    setSummary({
      status: 'active',
      current: currentItem?.fileName || 'replay',
      step: currentItem?.progress?.detail || 'Processing...',
      doneCount,
      total,
      pendingCount: pending.length,
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
        if (cancelledRef.current) { pollingRef.current.delete(item.jobId); return; }

        try {
          const job = await getUploadStatus(item.jobId);
          retries = 0;

          if (job.step) {
            updateQueueItem(item.id, { progress: { percent: 95, detail: job.step } });
            refreshSummary();
          }

          if (job.status === 'complete') {
            updateQueueItem(item.id, {
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
            updateQueueItem(item.id, { status: 'error', error: job.error, progress: null });
            pollingRef.current.delete(item.jobId);
            setDismissed(false);
            refreshSummary();
            return;
          }

          if (!cancelledRef.current) {
            setTimeout(poll, 2000);
          }
        } catch {
          if (cancelledRef.current) { pollingRef.current.delete(item.jobId); return; }
          retries++;
          if (retries >= MAX_RETRIES) {
            updateQueueItem(item.id, { status: 'error', error: 'Lost connection', progress: null });
            pollingRef.current.delete(item.jobId);
            refreshSummary();
            return;
          }
          setTimeout(poll, Math.min(2000 * Math.pow(1.5, retries), 15000));
        }
      };

      poll();
    }
  }, [refreshSummary]);

  useEffect(() => {
    cancelledRef.current = false;
    refreshSummary();
    pollProcessingJobs();

    const interval = setInterval(() => {
      refreshSummary();
      pollProcessingJobs();
    }, 3000);

    return () => {
      clearInterval(interval);
      cancelledRef.current = true;
    };
  }, [refreshSummary, pollProcessingJobs]);

  if (location.pathname === '/upload') return null;
  if (!summary || dismissed) return null;

  const handleDismiss = (e) => {
    e.stopPropagation();
    setDismissed(true);
  };

  if (summary.status === 'active') {
    return (
      <div className="upload-indicator processing" onClick={() => navigate('/upload')}>
        <span className="indicator-dot pulsing"></span>
        <span>Uploading {summary.doneCount + 1}/{summary.total}: {summary.step}</span>
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
