'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useWalletStore } from '../../store/app-store';

export default function RouteGuard({ children }) {
  const { address, isHydrated } = useWalletStore();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = Boolean(address);

  useEffect(() => {
    if (!isHydrated || isAuthenticated) return;
    const next = encodeURIComponent(pathname || '/');
    router.replace(`/?next=${next}`);
  }, [isHydrated, isAuthenticated, pathname, router]);

  if (!isHydrated || !isAuthenticated) return null;

  return children;
}
