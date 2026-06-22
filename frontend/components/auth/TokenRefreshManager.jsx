'use client';

import { useTokenRefresh } from '../../hooks/useTokenRefresh';

export default function TokenRefreshManager() {
  useTokenRefresh();
  return null;
}
