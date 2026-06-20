'use client';

import { useState, useEffect } from 'react';
import ProfileForm from '../../../components/profile/ProfileForm';

const CONNECTED_USER = 'GABCD1234EFGH5678IJKL9012MNOP3456QRST7890UVWX1234YZ56';

export default function EditProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const address = CONNECTED_USER;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${base}/api/users/${address}`);
        if (!res.ok) {
          throw new Error('Failed to fetch profile details');
        }
        const data = await res.json();
        setProfile(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [address]);

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Edit Profile</h1>
        <p className="text-gray-400">Update your public profile and preferences.</p>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading profile data...</div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl">
            {error}
          </div>
        ) : (
          <ProfileForm initialData={profile} address={address} />
        )}
      </div>
    </div>
  );
}
