'use client';

import React from "react";
import useNetworkStatus from "../../hooks/useNetworkStatus";

export default function OfflineBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null; // Hide when online

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-center py-2 shadow-md">
      ⚠️ You are currently offline. Some features may not work.
    </div>
  );
}
