import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadReplayChunked, getUploadStatus } from '../api';

const MAX_POLL_RETRIES = 10;

export default function Upload() {
  const [file, setFile] = useState(null);
  const [uploadKey, setUploadKey] = useState(() => localStorage.getItem('uploadKey') || '');
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);
  const cancelledRef = useRef(false);
  const navigate = useNavigate();

  const clearJob = useCallback(() => {
    sessionStorage.removeItem('uploadJobId');
    setUploading(false);
  }, []);

  const pollJob = useCallback((id, retries = 0) => {
    if (cancelledRef.current) return;

    const poll = async () => {
      try {
        const job = await getUploadStatus(id);
        retries = 0;

        if (job.status === 'complete') {
          clearJob();
          setProgress({ percent: 100, detail: 'Complete!' });
          setStatus({
            type: 'success',
            message: `Match ${job.matchId} recorded! ${job.players} players, ${job.parseMethod} parsing.`,
            matchId: job.matchId,
          });
          setFile(null);
          if (fileRef.current) fileRef.current.value = '';
          return;
        }

        if (job.status === 'error') {
          clearJob();
          setProgress(null);
          setStatus({
            type: 'error',
            message: job.error,
            stack: job.stack,
          });
          return;
        }

        if (job.step) {
          setProgress(prev => ({ ...prev, detail: job.step }));
        }

        if (!cancelledRef.current) {
          setTimeout(() => pollJob(id, 0), 2000);
        }
      } catch (err) {
        if (cancelledRef.current) return;

        if (retries >= MAX_POLL_RETRIES) {
          clearJob();
          setProgress(null);
          setStatus({
            type: 'error',
            message: `Lost connection to server after ${MAX_POLL_RETRIES} retries. The upload may still be processing — check the matches page in a few minutes.`,
          });
          return;
        }

        const delay = Math.min(2000 * Math.pow(1.5, retries), 15000);
        setTimeout(() => pollJob(id, retries + 1), delay);
      }
    };

    poll();
  }, [clearJob]);

  useEffect(() => {
    cancelledRef.current = false;
    const savedJobId = sessionStorage.getItem('uploadJobId');
    if (savedJobId) {
      setUploading(true);
      setProgress({ percent: 95, detail: 'Checking status...' });
      pollJob(savedJobId);
    }

    return () => {
      cancelledRef.current = true;
    };
  }, [pollJob]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !uploadKey) return;

    localStorage.setItem('uploadKey', uploadKey);
    setUploading(true);
    setStatus(null);
    setProgress({ percent: 0, detail: 'Starting upload...' });

    try {
      const result = await uploadReplayChunked(file, uploadKey, (p) => {
        setProgress({ percent: p.percent, detail: p.detail });
      });

      if (result.jobId) {
        cancelledRef.current = false;
        sessionStorage.setItem('uploadJobId', result.jobId);
        setProgress({ percent: 95, detail: 'Parsing replay — you can navigate away safely.' });
        pollJob(result.jobId);
      }
    } catch (err) {
      setUploading(false);
      setProgress(null);
      setStatus({ type: 'error', message: err.message });
    }
  };

  return (
    <div>
      <h1 className="page-title">Upload Replay</h1>
      <p className="page-subtitle">
        Upload a .dem replay file to record match stats. You need an upload key to submit replays.
        Re-uploading the same replay will replace the existing match data.
        {' '}<a href="/api/available-stats" className="stats-download-link" download>Download list of all parseable stats</a>
      </p>

      <form onSubmit={handleSubmit} className="upload-form">
        <div className="form-group">
          <label htmlFor="uploadKey">Upload Key</label>
          <input
            id="uploadKey"
            type="password"
            value={uploadKey}
            onChange={(e) => setUploadKey(e.target.value)}
            placeholder="Enter your upload key"
            className="form-input"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="replayFile">Replay File (.dem)</label>
          <div
            className={`drop-zone ${file ? 'has-file' : ''}`}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!uploading) e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
              if (uploading) return;
              const dropped = e.dataTransfer.files[0];
              if (dropped && (dropped.name.endsWith('.dem') || dropped.name.endsWith('.dem.bz2'))) {
                setFile(dropped);
              }
            }}
          >
            {file ? (
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-size">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            ) : (
              <div className="drop-text">
                <span>Click or drag a .dem file here</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            id="replayFile"
            type="file"
            accept=".dem,.dem.bz2"
            onChange={(e) => setFile(e.target.files[0] || null)}
            className="file-input-hidden"
          />
        </div>

        {progress && (
          <div className="progress-section">
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }}></div>
            </div>
            <div className="progress-detail">
              <span>{progress.detail}</span>
              <span className="progress-percent">{progress.percent}%</span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || !uploadKey || uploading}
          className="btn btn-primary btn-upload"
        >
          {uploading ? 'Processing...' : 'Upload Replay'}
        </button>
      </form>

      {status && (
        <div className={`status-message ${status.type}`}>
          <p>{status.message}</p>
          {status.type === 'info' && uploading && (
            <p className="status-hint">You can navigate to other pages — processing will continue in the background.</p>
          )}
          {status.stack && (
            <details className="error-details">
              <summary>Technical details</summary>
              <pre className="error-stack">{status.stack}</pre>
            </details>
          )}
          {status.matchId && (
            <button
              onClick={() => navigate(`/match/${status.matchId}`)}
              className="btn btn-sm"
            >
              View Match
            </button>
          )}
        </div>
      )}
    </div>
  );
}
