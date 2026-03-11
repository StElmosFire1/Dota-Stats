import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { uploadReplayChunked, getUploadStatus } from '../api';

const MAX_POLL_RETRIES = 10;
const STORAGE_KEY = 'uploadQueue';

function loadPersistedQueue() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function persistQueue(items) {
  const serializable = items.map(({ file, ...rest }) => ({
    ...rest,
    fileName: rest.fileName || (file ? file.name : 'unknown'),
    fileSize: rest.fileSize || (file ? file.size : 0),
  }));
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

function FileQueueItem({ item, isCurrent }) {
  const statusClass = item.status === 'complete' ? 'success' :
                      item.status === 'error' ? 'error' :
                      item.status === 'uploading' || item.status === 'processing' ? 'info' : '';

  const name = item.fileName || (item.file ? item.file.name : 'unknown');
  const size = item.fileSize || (item.file ? item.file.size : 0);

  return (
    <div className={`queue-item ${statusClass} ${isCurrent ? 'current' : ''}`}>
      <div className="queue-item-header">
        <span className="queue-file-name">{name}</span>
        <span className="queue-file-size">{(size / (1024 * 1024)).toFixed(1)} MB</span>
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
          <Link to={`/match/${item.result.matchId}`}>
            Match #{item.result.matchId}
          </Link>
          {' '}&mdash; {item.result.players} players
        </div>
      )}
      {item.status === 'error' && item.error && (
        <div className="queue-error">{item.error}</div>
      )}
    </div>
  );
}

export default function Upload() {
  const [queue, setQueue] = useState(() => loadPersistedQueue());
  const [uploadKey, setUploadKey] = useState(() => localStorage.getItem('uploadKey') || '');
  const cancelledRef = useRef(false);
  const fileRef = useRef(null);
  const processingRef = useRef(false);
  const pollingJobsRef = useRef(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    persistQueue(queue);
  }, [queue]);

  const updateItem = useCallback((id, updates) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const pollJob = useCallback((jobId, itemId) => {
    if (pollingJobsRef.current.has(jobId)) return Promise.resolve(null);
    pollingJobsRef.current.add(jobId);

    return new Promise((resolve, reject) => {
      let retries = 0;

      const poll = async () => {
        if (cancelledRef.current) {
          pollingJobsRef.current.delete(jobId);
          resolve(null);
          return;
        }

        try {
          const job = await getUploadStatus(jobId);
          retries = 0;

          if (job.step) {
            updateItem(itemId, { progress: { percent: 95, detail: job.step } });
          }

          if (job.status === 'complete') {
            pollingJobsRef.current.delete(jobId);
            resolve(job);
            return;
          }

          if (job.status === 'error') {
            pollingJobsRef.current.delete(jobId);
            reject(new Error(job.error || 'Parse failed'));
            return;
          }

          if (!cancelledRef.current) {
            setTimeout(poll, 2000);
          }
        } catch (err) {
          if (cancelledRef.current) {
            pollingJobsRef.current.delete(jobId);
            resolve(null);
            return;
          }
          retries++;
          if (retries >= MAX_POLL_RETRIES) {
            pollingJobsRef.current.delete(jobId);
            reject(new Error('Lost connection to server'));
            return;
          }
          const delay = Math.min(2000 * Math.pow(1.5, retries), 15000);
          setTimeout(poll, delay);
        }
      };

      poll();
    });
  }, [updateItem]);

  const resumeProcessingJobs = useCallback(() => {
    setQueue(prev => {
      for (const item of prev) {
        if (item.status === 'processing' && item.jobId && !pollingJobsRef.current.has(item.jobId)) {
          const itemId = item.id;
          const jobId = item.jobId;
          pollJob(jobId, itemId)
            .then(result => {
              if (result) {
                updateItem(itemId, {
                  status: 'complete',
                  progress: { percent: 100, detail: 'Complete!' },
                  result: { matchId: result.matchId, players: result.players },
                });
              }
            })
            .catch(err => {
              updateItem(itemId, { status: 'error', error: err.message, progress: null });
            });
        }
      }
      return prev;
    });
  }, [pollJob, updateItem]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    const savedKey = localStorage.getItem('uploadKey') || '';

    while (true) {
      await new Promise(r => setTimeout(r, 100));

      let nextItem = null;
      setQueue(prev => {
        const pending = prev.find(i => i.status === 'pending' && i.file);
        if (pending) nextItem = pending;
        return prev;
      });

      await new Promise(r => setTimeout(r, 50));
      if (!nextItem) {
        setQueue(prev => {
          const pending = prev.find(i => i.status === 'pending' && i.file);
          if (pending) nextItem = pending;
          return prev;
        });
        await new Promise(r => setTimeout(r, 50));
      }

      if (!nextItem) break;
      if (cancelledRef.current) break;

      const itemId = nextItem.id;
      updateItem(itemId, { status: 'uploading', progress: { percent: 0, detail: 'Starting upload...' } });

      try {
        const result = await uploadReplayChunked(nextItem.file, savedKey, (p) => {
          updateItem(itemId, { progress: { percent: p.percent, detail: p.detail } });
        });

        if (result.jobId) {
          updateItem(itemId, {
            status: 'processing',
            jobId: result.jobId,
            progress: { percent: 95, detail: 'Parsing replay...' },
          });

          const pollResult = await pollJob(result.jobId, itemId);
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
  }, [updateItem, pollJob]);

  const addFiles = useCallback((fileList) => {
    const validFiles = Array.from(fileList).filter(
      f => f.name.endsWith('.dem') || f.name.endsWith('.dem.bz2')
    );
    if (validFiles.length === 0) return;

    const newItems = validFiles.map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      fileName: f.name,
      fileSize: f.size,
      status: 'pending',
      progress: null,
      result: null,
      error: null,
      jobId: null,
    }));

    setQueue(prev => [...prev, ...newItems]);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    resumeProcessingJobs();
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    const hasPending = queue.some(i => i.status === 'pending' && i.file);
    if (hasPending && !processingRef.current && uploadKey) {
      processQueue();
    }
  }, [queue, uploadKey, processQueue]);

  const clearCompleted = () => {
    setQueue(prev => prev.filter(i => i.status !== 'complete' && i.status !== 'error'));
  };

  const clearAll = () => {
    setQueue([]);
  };

  const completedCount = queue.filter(i => i.status === 'complete').length;
  const errorCount = queue.filter(i => i.status === 'error').length;
  const pendingCount = queue.filter(i => i.status === 'pending').length;
  const processingCount = queue.filter(i => i.status === 'uploading' || i.status === 'processing').length;
  const activeItem = queue.find(i => i.status === 'uploading' || i.status === 'processing');

  return (
    <div>
      <h1 className="page-title">Upload Replays</h1>
      <p className="page-subtitle">
        Upload .dem replay files to record match stats. You can select multiple files at once.
        Re-uploading the same replay will replace the existing match data.
        You can navigate away — active uploads will keep their progress.
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
              {processingCount > 0 && <span className="queue-count info"> &mdash; {processingCount} active</span>}
              {completedCount > 0 && <span className="queue-count success"> &mdash; {completedCount} done</span>}
              {errorCount > 0 && <span className="queue-count error"> &mdash; {errorCount} failed</span>}
              {pendingCount > 0 && <span className="queue-count"> &mdash; {pendingCount} waiting</span>}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(completedCount > 0 || errorCount > 0) && (
                <button onClick={clearCompleted} className="btn btn-sm">Clear finished</button>
              )}
              {queue.length > 0 && !processingCount && (
                <button onClick={clearAll} className="btn btn-sm">Clear all</button>
              )}
            </div>
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
