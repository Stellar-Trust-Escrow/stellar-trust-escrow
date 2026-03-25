'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfileForm({ initialData = {}, address }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    displayName: initialData.displayName || '',
    bio: initialData.bio || '',
    preferences: initialData.preferences ? JSON.stringify(initialData.preferences, null, 2) : '{\n  "emailNotifications": true\n}',
  });

  const [avatarFile, setAvatarFile] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setAvatarFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // 1. Upload Avatar if exists
      if (avatarFile) {
        const fileData = new FormData();
        fileData.append('avatar', avatarFile);
        
        const avatarRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/users/${address}/avatar`, {
          method: 'POST',
          body: fileData,
        });
        
        if (!avatarRes.ok) {
          throw new Error('Failed to upload avatar');
        }
      }

      // 2. Update Profile info
      let parsedPrefs;
      try {
        parsedPrefs = JSON.parse(formData.preferences);
      } catch (err) {
        throw new Error('Preferences must be valid JSON');
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/users/${address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: formData.displayName,
          bio: formData.bio,
          preferences: parsedPrefs,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update profile');
      }

      // Optionally refresh data and route somewhere
      router.push(`/profile/${address}`);
      router.refresh();

    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Profile Picture</label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
            {initialData.avatarUrl ? (
              <img src={initialData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-500 text-sm">No img</span>
            )}
          </div>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange}
            className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600/20 file:text-indigo-400 hover:file:bg-indigo-600/30"
          />
        </div>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Display Name</label>
        <input 
          type="text" 
          name="displayName"
          value={formData.displayName}
          onChange={handleInputChange}
          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          placeholder="e.g. Satoshi Nakamoto"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Bio</label>
        <textarea 
          name="bio"
          value={formData.bio}
          onChange={handleInputChange}
          rows={4}
          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          placeholder="Tell us about yourself..."
        />
      </div>

      {/* Preferences JSON */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Preferences (JSON)</label>
        <textarea 
          name="preferences"
          value={formData.preferences}
          onChange={handleInputChange}
          rows={4}
          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <p className="mt-1 text-xs text-gray-500">Edit notification settings and layout preferences here in valid JSON format.</p>
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
