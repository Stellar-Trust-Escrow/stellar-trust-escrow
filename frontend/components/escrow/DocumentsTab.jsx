import React, { useState, useEffect, useRef } from 'react';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsTab({ escrowId }) {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const loadDocuments = async () => {
    try {
      const res = await fetch(`/api/documents/escrow/${escrowId}`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    }
  };

  useEffect(() => { if (escrowId) loadDocuments(); }, [escrowId]);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('escrowId', escrowId);
    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
      if (res.status === 413) { setError('File exceeds 10MB limit.'); return; }
      if (!res.ok) { setError('Upload failed. Please try again.'); return; }
      await loadDocuments();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleUpload(e.dataTransfer.files[0]);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>Escrow Documents</h3>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#6366f1' : 'var(--border, #e2e8f0)'}`,
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '1rem',
          backgroundColor: dragging ? 'rgba(99,102,241,0.05)' : 'transparent',
          transition: 'border-color 0.15s, background-color 0.15s',
          outline: 'none',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept=".pdf,.docx,.doc,.txt"
          onChange={e => handleUpload(e.target.files[0])}
        />
        {uploading
          ? 'Uploading and encrypting…'
          : 'Drop a file here or click to upload (PDF, DOCX — max 10MB)'}
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</div>
      )}

      {documents.length === 0 ? (
        <p style={{ color: 'var(--muted, #64748b)', fontSize: '0.875rem' }}>No documents uploaded yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {documents.map(doc => (
            <li
              key={doc.cid}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--border, #e2e8f0)',
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{doc.fileName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                  {formatSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString()}
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)', fontFamily: 'monospace' }}>
                {doc.cid?.slice(0, 12)}…
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
