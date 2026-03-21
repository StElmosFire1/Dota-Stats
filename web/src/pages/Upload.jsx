import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { uploadReplayChunked, getUploadStatus, getDuplicateMatches } from '../api';
import { useAdmin } from '../context/AdminContext';

const MAX_POLL_RETRIES = 10;
const STORAGE_KEY = 'uploadQueue';

function loadPersistedQueue() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw);
    return items.map(item => {
      if (item.status === 'uploading' && !item.jobId) {
        return { ...item, status: 'lost', error: 'Upload interrupted — please re-add this file' };
      }
      return item;
    });
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

function FileQueueItem({ item }) {
  const statusClass = item.status === 'complete' ? 'success' :
                      (item.status === 'error' || item.status === 'lost') ? 'error' :
                      item.status === 'uploading' || item.status === 'processing' ? 'info' : '';

  const name = item.fileName || (item.file ? item.file.name : 'unknown');
  const size = item.fileSize || (item.file ? item.file.size : 0);

  return (
    <div className={`queue-item ${statusClass}`}>
      <div className="queue-item-header">
        <span className="queue-file-name">{name}</span>
        <span className="queue-file-size">{(size / (1024 * 1024)).toFixed(1)} MB</span>
        <span className={`queue-status ${item.status}`}>
          {item.status === 'pending' && 'Waiting'}
          {item.status === 'uploading' && 'Uploading'}
          {item.status === 'processing' && 'Parsing'}
          {item.status === 'complete' && 'Done'}
          {item.status === 'error' && 'Failed'}
          {item.status === 'lost' && 'Interrupted'}
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
          <span style={{ marginRight: '0.5rem' }}>
            {item.result.isNew
              ? <span style={{ color: '#4caf50', fontWeight: 600 }}>✓ New match</span>
              : item.result.replaceReason === 'sameFile'
                ? <span style={{ color: '#ff9800', fontWeight: 600 }}>↺ Re-upload (same file, stats refreshed)</span>
                : <span style={{ color: '#2196f3', fontWeight: 600 }}>↺ Updated (same match ID, stats refreshed)</span>
            }
          </span>
          &mdash;{' '}
          <Link to={`/match/${item.result.matchId}`}>Match #{item.result.matchId}</Link>
          {' '}&mdash; {item.result.players} players
        </div>
      )}
      {(item.status === 'error' || item.status === 'lost') && item.error && (
        <div className="queue-error">{item.error}</div>
      )}
    </div>
  );
}

export default function Upload() {
  const { isAdmin, adminKey, setShowModal } = useAdmin();
  const [queue, setQueue] = useState(() => loadPersistedQueue());
  const [patch, setPatch] = useState(() => localStorage.getItem('uploadPatch') || '');
  const [dupScanState, setDupScanState] = useState('idle');
  const [dupResults, setDupResults] = useState(null);
  const fileRef = useRef(null);
  const adminKeyRef = useRef(adminKey);
  useEffect(() => { adminKeyRef.current = adminKey; }, [adminKey]);
  const pollingJobsRef = useRef(new Set());
  const uploadingRef = useRef(new Set());
  const unmountedRef = useRef(false);
  const timerIdsRef = useRef(new Set());

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      for (const id of timerIdsRef.current) clearTimeout(id);
      timerIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    persistQueue(queue);
  }, [queue]);

  const safeUpdateItem = useCallback((id, updates) => {
    if (unmountedRef.current) {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const items = JSON.parse(raw);
        const updated = items.map(item => item.id === id ? { ...item, ...updates } : item);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return;
    }
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const safeTimeout = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timerIdsRef.current.delete(id);
      fn();
    }, ms);
    timerIdsRef.current.add(id);
    return id;
  }, []);

  const startPolling = useCallback((jobId, itemId) => {
    if (pollingJobsRef.current.has(jobId)) return;
    pollingJobsRef.current.add(jobId);

    let retries = 0;
    const poll = async () => {
      try {
        const job = await getUploadStatus(jobId);
        retries = 0;

        if (job.step) {
          safeUpdateItem(itemId, { progress: { percent: 95, detail: job.step } });
        }

        if (job.status === 'complete') {
          pollingJobsRef.current.delete(jobId);
          safeUpdateItem(itemId, {
            status: 'complete',
            progress: { percent: 100, detail: 'Complete!' },
            result: {
              matchId: job.matchId,
              players: job.players,
              isNew: job.isNew,
              replaceReason: job.replaceReason,
            },
          });
          return;
        }

        if (job.status === 'error') {
          pollingJobsRef.current.delete(jobId);
          safeUpdateItem(itemId, { status: 'error', error: job.error || 'Parse failed', progress: null });
          return;
        }

        safeTimeout(poll, 2000);
      } catch (err) {
        retries++;
        if (retries >= MAX_POLL_RETRIES) {
          pollingJobsRef.current.delete(jobId);
          safeUpdateItem(itemId, { status: 'error', error: 'Lost connection to server', progress: null });
          return;
        }
        safeTimeout(poll, Math.min(2000 * Math.pow(1.5, retries), 15000));
      }
    };

    poll();
  }, [safeUpdateItem, safeTimeout]);

  const uploadSingleFile = useCallback(async (item) => {
    const itemId = item.id;
    if (uploadingRef.current.has(itemId)) return;
    uploadingRef.current.add(itemId);

    const savedKey = adminKeyRef.current || '';
    safeUpdateItem(itemId, { status: 'uploading', progress: { percent: 0, detail: 'Starting upload...' } });

    try {
      const result = await uploadReplayChunked(item.file, savedKey, (p) => {
        safeUpdateItem(itemId, { progress: { percent: p.percent, detail: p.detail } });
      }, item.patch || '');

      if (result.jobId) {
        safeUpdateItem(itemId, {
          status: 'processing',
          jobId: result.jobId,
          progress: { percent: 95, detail: 'Queued for parsing...' },
        });
        startPolling(result.jobId, itemId);
      }
    } catch (err) {
      safeUpdateItem(itemId, { status: 'error', error: err.message, progress: null });
    } finally {
      uploadingRef.current.delete(itemId);
    }
  }, [safeUpdateItem, startPolling]);

  useEffect(() => {
    const toResume = queue.filter(i => i.status === 'processing' && i.jobId && !pollingJobsRef.current.has(i.jobId));
    for (const item of toResume) {
      startPolling(item.jobId, item.id);
    }
  }, []);

  useEffect(() => {
    if (!adminKey) return;

    const pendingWithFiles = queue.filter(i => i.status === 'pending' && i.file && !uploadingRef.current.has(i.id));
    for (const item of pendingWithFiles) {
      uploadSingleFile(item);
    }
  }, [queue, adminKey, uploadSingleFile]);

  const addFiles = useCallback((fileList) => {
    const validFiles = Array.from(fileList).filter(
      f => f.name.endsWith('.dem') || f.name.endsWith('.dem.bz2')
    );
    if (validFiles.length === 0) return;

    const currentPatch = localStorage.getItem('uploadPatch') || '';
    const newItems = validFiles.map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      fileName: f.name,
      fileSize: f.size,
      patch: currentPatch,
      status: 'pending',
      progress: null,
      result: null,
      error: null,
      jobId: null,
    }));

    setQueue(prev => [...prev, ...newItems]);
  }, []);

  const clearCompleted = () => {
    setQueue(prev => prev.filter(i => i.status !== 'complete' && i.status !== 'error' && i.status !== 'lost'));
  };

  const clearAll = () => {
    setQueue([]);
    pollingJobsRef.current.clear();
  };

  const runDupScan = async () => {
    setDupScanState('scanning');
    setDupResults(null);
    try {
      const results = await getDuplicateMatches(adminKey);
      setDupResults(results);
      setDupScanState('done');
    } catch (err) {
      setDupResults([]);
      setDupScanState('error');
    }
  };

  const completedCount = queue.filter(i => i.status === 'complete').length;
  const errorCount = queue.filter(i => i.status === 'error' || i.status === 'lost').length;
  const pendingCount = queue.filter(i => i.status === 'pending').length;
  const activeCount = queue.filter(i => i.status === 'uploading' || i.status === 'processing').length;

  return (
    <div>
      <h1 className="page-title">Upload Replays</h1>
      <p className="page-subtitle">
        Upload .dem replay files to record match stats. Select multiple files — they all upload simultaneously.
        Once uploaded to the server, parsing continues in the background even if you navigate away.
        {' '}<a href="/api/available-stats" className="stats-download-link" download>Download list of all parseable stats</a>
      </p>

      {!isAdmin && (
        <div className="status-message" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>Login as admin</button>
          {' '}to upload replays.
        </div>
      )}

      <div className="upload-form" style={{ opacity: isAdmin ? 1 : 0.5, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <div className="form-group">
          <label htmlFor="patchInput">Patch <span style={{ color: '#888', fontWeight: 400 }}>(optional — applied to all files added below)</span></label>
          <input
            id="patchInput"
            type="text"
            value={patch}
            onChange={(e) => {
              setPatch(e.target.value);
              localStorage.setItem('uploadPatch', e.target.value);
            }}
            placeholder="e.g. 7.38"
            className="form-input"
            style={{ maxWidth: '200px' }}
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
              {activeCount > 0 && <span className="queue-count info"> &mdash; {activeCount} active</span>}
              {completedCount > 0 && <span className="queue-count success"> &mdash; {completedCount} done</span>}
              {errorCount > 0 && <span className="queue-count error"> &mdash; {errorCount} failed</span>}
              {pendingCount > 0 && <span className="queue-count"> &mdash; {pendingCount} waiting</span>}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(completedCount > 0 || errorCount > 0) && (
                <button onClick={clearCompleted} className="btn btn-sm">Clear finished</button>
              )}
              {queue.length > 0 && activeCount === 0 && (
                <button onClick={clearAll} className="btn btn-sm">Clear all</button>
              )}
            </div>
          </div>
          <div className="queue-list">
            {queue.map(item => (
              <FileQueueItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {!isAdmin && queue.length > 0 && pendingCount > 0 && (
        <div className="status-message error">
          <p><button className="btn btn-small" onClick={() => setShowModal(true)}>Login as admin</button> to start uploading.</p>
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Duplicate Match Scanner</h3>
          <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            Scans all matches for pairs that share the exact same set of heroes and result — a strong indicator of the same game recorded twice.
          </p>
          <button
            className="btn btn-secondary"
            onClick={runDupScan}
            disabled={dupScanState === 'scanning'}
          >
            {dupScanState === 'scanning' ? 'Scanning…' : 'Scan for Duplicates'}
          </button>

          {dupScanState === 'error' && (
            <p style={{ color: '#f44336', marginTop: '0.5rem' }}>Scan failed — check console for details.</p>
          )}

          {dupScanState === 'done' && dupResults !== null && (
            <div style={{ marginTop: '1rem' }}>
              {dupResults.length === 0 ? (
                <p style={{ color: '#4caf50' }}>✓ No duplicates found.</p>
              ) : (
                <>
                  <p style={{ color: '#ff9800', marginBottom: '0.5rem' }}>
                    ⚠ {dupResults.length} potential duplicate pair{dupResults.length !== 1 ? 's' : ''} found:
                  </p>
                  <table className="stats-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Match 1</th>
                        <th>Match 2</th>
                        <th>Date 1</th>
                        <th>Date 2</th>
                        <th>Duration diff</th>
                        <th>Same players</th>
                        <th>Same KDA totals</th>
                        <th>Same net worth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dupResults.map((row, i) => {
                        const durationDiff = parseInt(row.duration_diff);
                        const likelyDup = row.same_players && row.same_totals && row.same_nw && durationDiff < 60;
                        return (
                          <tr key={i} style={{ background: likelyDup ? 'rgba(244,67,54,0.08)' : undefined }}>
                            <td><Link to={`/match/${row.match_id_1}`}>#{row.match_id_1}</Link></td>
                            <td><Link to={`/match/${row.match_id_2}`}>#{row.match_id_2}</Link></td>
                            <td>{row.date_1 ? new Date(row.date_1).toLocaleDateString() : '—'}</td>
                            <td>{row.date_2 ? new Date(row.date_2).toLocaleDateString() : '—'}</td>
                            <td style={{ color: durationDiff < 60 ? '#f44336' : durationDiff < 300 ? '#ff9800' : '#aaa' }}>
                              {durationDiff}s
                            </td>
                            <td style={{ color: row.same_players ? '#4caf50' : '#aaa' }}>
                              {row.same_players ? '✓ Yes' : '✗ No'}
                            </td>
                            <td style={{ color: row.same_totals ? '#4caf50' : '#aaa' }}>
                              {row.same_totals
                                ? `✓ ${row.kills_1}/${row.deaths_1}`
                                : `✗ ${row.kills_1}/${row.deaths_1} vs ${row.kills_2}/${row.deaths_2}`}
                            </td>
                            <td style={{ color: row.same_nw ? '#4caf50' : '#aaa' }}>
                              {row.same_nw
                                ? `✓ ${Math.round(row.nw_1 / 1000)}k`
                                : `✗ ${Math.round(row.nw_1 / 1000)}k vs ${Math.round(row.nw_2 / 1000)}k`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    Rows highlighted in red are very likely duplicates (same players, same kill/death totals, duration within 60s). Delete the unwanted match from the match page.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
