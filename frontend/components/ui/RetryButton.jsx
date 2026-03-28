import React, { useState } from "react";

export default function RetryButton({ onRetry, retries = 3, children }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onRetry();
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
    >
      {loading ? "Retrying..." : children || "Retry"}
    </button>
  );
}