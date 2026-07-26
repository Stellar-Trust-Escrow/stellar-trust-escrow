'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminStore } from '../../store/app-store';

/**
 * Higher-Order Component for role-based access control
 * Redirects to home page if user doesn't have the required role
 */
export function requireRole(requiredRole) {
  return function WrappedComponent(props) {
    const { apiKey, isAuthenticated } = useAdminStore();
    const router = useRouter();

    useEffect(() => {
      // For now, we check if user has admin API key
      // In a full implementation, this would validate the specific role
      if (!isAuthenticated || requiredRole === 'admin' && !apiKey) {
        router.replace('/');
      }
    }, [isAuthenticated, apiKey, requiredRole, router]);

    // Don't render if not authenticated
    if (!isAuthenticated || (requiredRole === 'admin' && !apiKey)) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };
}
