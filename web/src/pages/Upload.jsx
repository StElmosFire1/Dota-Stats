import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadReplayChunked, getUploadStatus } from '../api';

const MAX_POLL_RETRIES = 10;

function FileQueueItem({ item, isCurrent }) {
  const statusClass = item.status === 'complete' ? 'success' :
                      item.status === 'error' ? 'error' :
                      item.status === 'uploading' || item.status === 'processing' ? 'info' : '';

  return (
    <div className={`queue-item ${statusClass} ${isCurrent ? 'current' : ''}`}>
      <div className="queue-item-header">
        <span className="queue-file-name">{item.file.name}</span>
        <span className="queue-file-size">{(item.file.size / (1024 * 1024)).toFixed(1)} MB</span>
        <span className={`queue-status ${item.status}`}>
          {item.status === 'pending' && 'Waiting'}
          {item.status === 'uploading' && 'Uploading'}
          {item.status === 'processing' && 'Parsing'}
          {item.status === 'complete' && 'Done'}
          {item.status === 'error' && 'Failed'}
        </span>
      </div>
      {(item.status === 'uploading' || item.status === 'processing') && item.progress && (
        <div className="progress-section compact">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${item.progress.percent}%` }}></div>
          </div>
          <div className="progress-detail">
            <span>{item.progress.detail}</span>
          </div>
        </div>
      )}
      {item.status === 'complete' && item.result && (
        <div className="queue-result">
          Match #{item.result.matchId} — {item.result.players} players
        </div>
      )}
      {item.status === 'error' && item.error && (
        <div className="queue-error">{item.error}</div>
      )}
    </div>
  );
}

export default function Upload() {
  const [queue, setQueue] = useState([]);
  const [uploadKey, setUploadKey] = useState(() => localStorage.getItem('uploadKey') || '');
  const [processing, setProcessing] = useState(false);
  const cancelledRef = useRef(false);
  const fileRef = useRef(null);
  const processingRef = useRef(false);
  const navigate = useNavigate();

  const updateItem = useCallback((id, updates) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const pollJob = useCallback((jobId) => {
    return new Promise((resolve, reject) => {
      let retries = 0;

      const poll = async () => {
        if (cancelledRef.current) { resolve(null); return; }

        try {
          const job = await getUploadStatus(jobId);
          retries = 0;

          if (job.status === 'complete') {
            resolve(job);
            return;
          }

          if (job.status === 'error') {
            reject(new Error(job.error || 'Parse failed'));
            return;
          }

          if (!cancelledRef.current) {
            setTimeout(poll, 2000);
          }
        } catch (err) {
          if (cancelledRef.current) { resolve(null); return; }
          retries++;
          if (retries >= MAX_POLL_RETRIES) {
            reject(new Error('Lost connection to server'));
            return;
          }
          const delay = Math.min(2000 * Math.pow(1.5, retries), 15000);
          setTimeout(poll, delay);
        }
      };

      poll();
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);

    const savedKey = localStorage.getItem('uploadKey') || '';

    while (true) {
      let nextItem = null;
      setQueue(prev => {
        const pending = prev.find(i => i.status === 'pending');
        if (pending) nextItem = pending;
        return prev;
      });

      await new Promise(r => setTimeout(r, 50));
      setQueue(prev => {
        const pending = prev.find(i => i.status === 'pending');
        if (pending) nextItem = pending;
        return prev;
      });
      await new Promise(r => setTimeout(r, 50));

      if (!nextItem) break;
      if (cancelledRef.current) break;

      const itemId = nextItem.id;
      updateItem(itemId, { status: 'uploading', progress: { percent: 0, detail: 'Starting upload...' } });

      try {
        const result = await uploadReplayChunked(nextItem.file, savedKey, (p) => {
          updateItem(itemId, { progress: { percent: p.percent, detail: p.detail } });
        });

        if (result.jobId) {
          updateItem(itemId, { status: 'processing', progress: { percent: 95, detail: 'Parsing replay...' } });

          const pollResult = await pollJob(result.jobId);
          if (pollResult) {
            updateItem(itemId, {
              status: 'complete',
              progress: { percent: 100, detail: 'Complete!' },
              result: { matchId: pollResult.matchId, players: pollResult.players },
            });
          }
        }
      } catch (err) {
        updateItem(itemId, { status: 'error', error: err.message, progress: null });
      }
    }

    processingRef.current = false;
    setProcessing(false);
  }, [updateItem, pollJob]);

  const addFiles = useCallback((fileList) => {
    const validFiles = Array.from(fileList).filter(
      f => f.name.endsWith('.dem') || f.name.endsWith('.dem.bz2')
    );
    if (validFiles.length === 0) return;

    const newItems = validFiles.map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: 'pending',
      progress: null,
      result: null,
      error: null,
    }));

    setQueue(prev => [...prev, ...newItems]);
  }, []);

  useEffect(() => {
    const hasPending = queue.some(i => i.status === 'pending');
    if (hasPending && !processingRef.current && uploadKey) {
      processQueue();
    }
  }, [queue, uploadKey, processQueue]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  const removeItem = (id) => {
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  const clearCompleted = () => {
    setQueue(prev => prev.filter(i => i.status !== 'complete' && i.status !== 'error'));
  };

  const completedCount = queue.filter(i => i.status === 'complete').length;
  const errorCount = queue.filter(i => i.status === 'error').length;
  const pendingCount = queue.filter(i => i.status === 'pending').length;
  const activeItem = queue.find(i => i.status === 'uploading' || i.status === 'processing');

  return (
    <div>
      <h1 className="page-title">Upload Replays</h1>
      <p className="page-subtitle">
        Upload .dem replay files to record match stats. You can select multiple files at once.
        Re-uploading the same replay will replace the existing match data.
        {' '}<a href="/api/available-stats" className="stats-download-link" download>Download list of all parseable stats</a>
      </p>

      <div className="upload-form">
        <div className="form-group">
          <label htmlFor="uploadKey">Upload Key</label>
          <input
            id="uploadKey"
            type="password"
            value={uploadKey}
            onChange={(e) => {
              setUploadKey(e.target.value);
              localStorage.setItem('uploadKey', e.target.value);
            }}
            placeholder="Enter your upload key"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Replay Files (.dem)</label>
          <div
            className={`drop-zone ${queue.length > 0 ? 'has-file' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
              addFiles(e.dataTransfer.files);
            }}
          >
            <div className="drop-text">
              <span>Click or drag .dem files here (multiple allowed)</span>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".dem,.dem.bz2"
            multiple
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
            className="file-input-hidden"
          />
        </div>
      </div>

      {queue.length > 0 && (
        <div className="upload-queue">
          <div className="queue-header">
            <h3>
              Upload Queue
              {completedCount > 0 && <span className="queue-count success"> — {completedCount} done</span>}
              {errorCount > 0 && <span className="queue-count error"> — {errorCount} failed</span>}
              {pendingCount > 0 && <span className="queue-count"> — {pendingCount} waiting</span>}
            </h3>
            {(completedCount > 0 || errorCount > 0) && (
              <button onClick={clearCompleted} className="btn btn-sm">Clear finished</button>
            )}
          </div>
          <div className="queue-list">
            {queue.map(item => (
              <FileQueueItem
                key={item.id}
                item={item}
                isCurrent={activeItem?.id === item.id}
              />
            ))}
          </div>
        </div>
      )}

      {!uploadKey && queue.length > 0 && (
        <div className="status-message error">
          <p>Enter an upload key to start processing.</p>
        </div>
      )}
    </div>
  );
}
