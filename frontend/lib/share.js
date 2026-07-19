'use client';

/**
 * share — Web Share API wrapper with a clipboard fallback.
 *
 * On mobile, "Share" / "Copy link" buttons should prefer the native
 * `navigator.share()` sheet when available and otherwise copy the link to the
 * clipboard (Issue #1444).
 *
 * @param {{ title?: string, text?: string, url?: string }} content
 * @returns {Promise<{ shared: boolean, method: 'native'|'clipboard', url?: string, error?: Error }>}
 */

async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // Legacy fallback for insecure contexts / older browsers.
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore — clipboard access was blocked
    } finally {
      document.body.removeChild(textarea);
    }
    return true;
  }

  return false;
}

export async function shareContent(content = {}) {
  const { title, text, url } = content;
  const targetUrl =
    url || (typeof window !== 'undefined' ? window.location.href : '');

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url: targetUrl });
      return { shared: true, method: 'native', url: targetUrl };
    } catch (error) {
      // AbortError is thrown when the user dismisses the native sheet — treat
      // as a non-error cancellation that still did not share.
      return { shared: false, method: 'native', url: targetUrl, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  await copyToClipboard(targetUrl);
  return { shared: false, method: 'clipboard', url: targetUrl };
}

export { copyToClipboard };

export default shareContent;
