import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext';
import {
  getPatchNotes,
  createPatchNote,
  updatePatchNote,
  deletePatchNote,
} from '../api';

function formatDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function renderContent(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return <h3 key={i} style={{ color: 'var(--accent)', marginTop: 18, marginBottom: 6, fontSize: 15 }}>{line.slice(3)}</h3>;
    }
    if (line.startsWith('# ')) {
      return <h2 key={i} style={{ color: 'var(--text-primary)', marginTop: 20, marginBottom: 8, fontSize: 17 }}>{line.slice(2)}</h2>;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{line.slice(2)}</span>
        </div>
      );
    }
    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
    return <p key={i} style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0', lineHeight: 1.6 }}>{line}</p>;
  });
}

const emptyForm = { version: '', title: '', content: '', author: '' };

export default function PatchNotes() {
  const { isAdmin } = useAdmin();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [uploadKey, setUploadKey] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    setLoading(true);
    getPatchNotes()
      .then(d => {
        setNotes(d.patchNotes || []);
        if (d.patchNotes?.length > 0) setExpanded(d.patchNotes[0].id);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (note) => {
    setEditId(note.id);
    setForm({ version: note.version, title: note.title, content: note.content, author: note.author || '' });
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.version.trim() || !form.title.trim() || !form.content.trim()) {
      return setFormError('Version, title, and content are required.');
    }
    if (!uploadKey.trim()) return setFormError('Enter your admin key to save.');
    setSaving(true);
    setFormError(null);
    try {
      let saved;
      if (editId) {
        saved = await updatePatchNote(editId, form, uploadKey);
        setNotes(n => n.map(x => x.id === editId ? saved : x));
      } else {
        saved = await createPatchNote(form, uploadKey);
        setNotes(n => [saved, ...n]);
        setExpanded(saved.id);
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!uploadKey.trim()) return setFormError('Enter your admin key to delete.');
    try {
      await deletePatchNote(id, uploadKey);
      setNotes(n => n.filter(x => x.id !== id));
      if (expanded === id) setExpanded(null);
      setConfirmDelete(null);
    } catch (e) {
      setFormError(e.message);
    }
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: 'var(--text-primary)' }}>📋 Patch Notes</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Bot, website, and rules updates for the inhouse community
          </p>
        </div>
        {isAdmin && (
          <button className="btn" onClick={openCreate} style={{ fontSize: 13 }}>
            + New Patch
          </button>
        )}
      </div>

      {isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <input
            type="password"
            placeholder="Admin key (required to save/delete)"
            value={uploadKey}
            onChange={e => setUploadKey(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-input)', color: 'var(--text-primary)',
              fontSize: 13, width: 280,
            }}
          />
        </div>
      )}

      {formError && (
        <div style={{ background: '#3b1a1a', border: '1px solid #e05c5c', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#ff9999', fontSize: 13 }}>
          {formError}
        </div>
      )}

      {showForm && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, marginBottom: 24,
        }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>{editId ? 'Edit Patch Note' : 'New Patch Note'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, marginBottom: 12 }}>
            {[['version', 'Version (e.g. 1.4.2)'], ['title', 'Title'], ['author', 'Author (optional)']].map(([key, ph]) => (
              <input
                key={key}
                type="text"
                placeholder={ph}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{
                  padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13,
                }}
              />
            ))}
          </div>
          <textarea
            placeholder={`Content — supports simple markdown:\n# Heading\n## Subheading\n- Bullet point\nPlain text paragraph`}
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={12}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-input)',
              color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace',
              resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : (editId ? 'Save Changes' : 'Publish')}
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Loading…</div>}
      {error && <div style={{ color: '#ff9999', textAlign: 'center', padding: 40 }}>{error}</div>}

      {!loading && notes.length === 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-secondary)',
        }}>
          No patch notes yet.{isAdmin && ' Use the button above to publish the first one.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.map(note => {
          const isOpen = expanded === note.id;
          return (
            <div
              key={note.id}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 12, overflow: 'hidden',
                boxShadow: isOpen ? '0 2px 12px rgba(0,0,0,0.3)' : 'none',
                transition: 'box-shadow 0.2s',
              }}
            >
              <div
                onClick={() => setExpanded(isOpen ? null : note.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px', cursor: 'pointer',
                  borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.04em', flexShrink: 0,
                }}>
                  v{note.version}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>{note.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {formatDate(note.published_at)}{note.author ? ` · ${note.author}` : ''}
                  </div>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: 18, userSelect: 'none' }}>
                  {isOpen ? '▲' : '▼'}
                </span>
              </div>

              {isOpen && (
                <div style={{ padding: '16px 20px 20px' }}>
                  {renderContent(note.content)}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                      <button className="btn btn-small" onClick={() => openEdit(note)}>✏️ Edit</button>
                      {confirmDelete === note.id ? (
                        <>
                          <button className="btn btn-small" style={{ background: '#8b0000', borderColor: '#c00' }} onClick={() => handleDelete(note.id)}>Confirm Delete</button>
                          <button className="btn btn-small btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-small btn-secondary" onClick={() => setConfirmDelete(note.id)}>🗑 Delete</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
