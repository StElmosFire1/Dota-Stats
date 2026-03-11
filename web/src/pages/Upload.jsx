import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadReplay } from '../api';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [uploadKey, setUploadKey] = useState(() => localStorage.getItem('uploadKey') || '');
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !uploadKey) return;

    localStorage.setItem('uploadKey', uploadKey);
    setUploading(true);
    setStatus(null);

    try {
      const result = await uploadReplay(file, uploadKey);
      setStatus({
        type: 'success',
        message: `Match ${result.matchId} recorded! ${result.players} players, ${result.parseMethod} parsing.`,
        matchId: result.matchId,
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Upload Replay</h1>
      <p className="page-subtitle">
        Upload a .dem replay file to record match stats. You need an upload key to submit replays.
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
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
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

        <button
          type="submit"
          disabled={!file || !uploadKey || uploading}
          className="btn btn-primary btn-upload"
        >
          {uploading ? 'Parsing & uploading...' : 'Upload Replay'}
        </button>
      </form>

      {status && (
        <div className={`status-message ${status.type}`}>
          <p>{status.message}</p>
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
