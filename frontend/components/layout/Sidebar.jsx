/**
 * Sidebar Component
 *
 * Collapsible sidebar navigation with localStorage persistence.
 * - Collapses to icon-only mode for more content area
 * - Mobile (< 768px): hidden by default, shown as overlay with backdrop
 * - Icons show tooltips on hover when collapsed
 *
 * @param {object}   props
 * @param {Array<{href: string, label: string, icon: React.ReactNode}>} props.navItems
 * @param {string}   [props.storageKey='sidebar-collapsed'] - localStorage key
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Tooltip from '../ui/Tooltip';

const STORAGE_KEY = 'sidebar-collapsed';
const MOBILE_BREAKPOINT = 768;

export default function Sidebar({
  navItems = [],
  storageKey = STORAGE_KEY,
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check mobile on mount and resize
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Load persisted collapse state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        setCollapsed(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, [storageKey]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [storageKey]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Close mobile on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') closeMobile();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen, closeMobile]);

  // Prevent body scroll when mobile overlay is open
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = mobileOpen ? 'hidden' : '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen, isMobile]);

  const sidebarContent = (
    <aside
      className={`flex flex-col h-full bg-gray-900 border-r border-gray-800
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[56px]' : 'w-[220px]'}`}
      role="navigation"
      aria-label="Sidebar navigation"
    >
      {/* Header with collapse toggle */}
      <div
        className={`flex items-center h-14 border-b border-gray-800 px-3
          ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2" onClick={closeMobile}>
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              S
            </div>
            <span className="font-bold text-white text-sm truncate">
              StellarTrust<span className="text-indigo-400">Escrow</span>
            </span>
          </Link>
        )}
        {collapsed && (
          <Link href="/" onClick={closeMobile}>
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">
              S
            </div>
          </Link>
        )}

        {/* Desktop collapse toggle */}
        {!isMobile && (
          <button
            onClick={toggleCollapsed}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800
                       transition-colors flex-shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Nav items */}
      <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto" role="list">
        {navItems.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/');
          const linkContent = (
            <Link
              key={href}
              href={href}
              onClick={closeMobile}
              className={`flex items-center gap-3 rounded-lg transition-colors
                ${collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2'}
                ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'
                }`}
            >
              <span className="flex-shrink-0" aria-hidden="true">
                {icon}
              </span>
              {!collapsed && (
                <span className="text-sm font-medium truncate">{label}</span>
              )}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={href} content={label} position="right">
                {linkContent}
              </Tooltip>
            );
          }

          return linkContent;
        })}
      </div>
    </aside>
  );

  // Mobile hamburger toggle button
  const mobileToggleButton = isMobile && (
    <button
      onClick={() => setMobileOpen(true)}
      className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-gray-900 border border-gray-700
                 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      aria-label="Open sidebar navigation"
      aria-expanded={mobileOpen}
    >
      {mobileOpen ? <X size={20} /> : <Menu size={20} />}
    </button>
  );

  return (
    <>
      {mobileToggleButton}

      {/* Mobile overlay + backdrop — only render when opened */}
      {isMobile && mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            aria-hidden="true"
            onClick={closeMobile}
            className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-300
              opacity-100 pointer-events-auto"
          />

          {/* Sliding sidebar */}
          <div
            className="fixed top-0 left-0 z-50 h-full transition-transform duration-300 ease-in-out
              translate-x-0"
          >
            {sidebarContent}
          </div>
        </>
      )}

      {/* Desktop sidebar */}
      {!isMobile && sidebarContent}
    </>
  );
}
