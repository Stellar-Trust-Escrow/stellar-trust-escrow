/**
 * DisputeSubmissionForm Component
 *
 * Multi-field form for raising disputes with file upload support.
 * Features drag-and-drop, file validation, and progress tracking.
 *
 * @param {object} props
 * @param {string} props.escrowId - Escrow ID to dispute
 * @param {Function} props.onSubmit - (formData) => Promise
 * @param {Function} [props.onCancel] - Callback when cancelled
 */

'use client';

import { useState, useRef } from 'react';
import { Upload, X, File, Image as ImageIcon, Video } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'video/mp4'];

export default function DisputeSubmissionForm({ escrowId, onSubmit, onCancel }) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const dragOverRef = useRef(false);

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
    if (type.startsWith('video/')) return <Video className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Allowed: PDF, PNG, JPG, MP4';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File exceeds 10MB limit';
    }
    return null;
  };

  const addFiles = (newFiles) => {
    const validatedFiles = [];
    const newErrors = {};

    Array.from(newFiles).forEach((file, idx) => {
      if (files.length + validatedFiles.length >= MAX_FILES) {
        newErrors[`max`] = `Maximum ${MAX_FILES} files allowed`;
        return;
      }

      const error = validateFile(file);
      if (error) {
        newErrors[file.name] = error;
      } else {
        validatedFiles.push({
          id: `${Date.now()}-${idx}`,
          file,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        });
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...newErrors }));
    }

    setFiles((prev) => [...prev, ...validatedFiles]);
  };

  const removeFile = (id) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    dragOverRef.current = true;
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragOverRef.current = false;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragOverRef.current = false;
    addFiles(e.dataTransfer.files);
  };

  const validate = () => {
    const newErrors = {};
    if (!reason.trim()) newErrors.reason = 'Reason is required';
    if (!description.trim()) newErrors.description = 'Description is required';
    if (files.length === 0) newErrors.files = 'At least one evidence file required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('escrowId', escrowId);
      formData.append('reason', reason);
      formData.append('description', description);

      files.forEach((f) => {
        formData.append('evidence', f.file);
      });

      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl" data-testid="dispute-form">
      {/* Reason */}
      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-white mb-2">
          Reason for Dispute *
        </label>
        <select
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg
                     focus:outline-none focus:border-indigo-500"
          disabled={loading}
        >
          <option value="">Select a reason...</option>
          <option value="work_not_delivered">Work not delivered</option>
          <option value="work_quality">Poor work quality</option>
          <option value="work_incomplete">Work incomplete</option>
          <option value="communication">Communication issues</option>
          <option value="other">Other</option>
        </select>
        {errors.reason && <p className="text-red-500 text-xs mt-1">{errors.reason}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-white mb-2">
          Description *
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue in detail..."
          rows={4}
          className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg
                     focus:outline-none focus:border-indigo-500"
          disabled={loading}
        />
        {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">Evidence Files *</label>

        {/* Drag-and-drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
            ${
              dragOverRef.current
                ? 'border-indigo-500 bg-indigo-900/20'
                : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
            }`}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-300">
            Drag and drop files here, or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Max 10MB per file, up to 5 files (PDF, PNG, JPG, MP4)
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.mp4"
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
          disabled={loading}
        />

        {errors.files && <p className="text-red-500 text-xs mt-1">{errors.files}</p>}
        {errors.max && <p className="text-red-500 text-xs mt-1">{errors.max}</p>}

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg"
              >
                {f.preview ? (
                  <img
                    src={f.preview}
                    alt={f.file.name}
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center">
                    {getFileIcon(f.file.type)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{f.file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(f.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  disabled={loading}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300
                     hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium
                     hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit Dispute'}
        </button>
      </div>
    </form>
  );
}
