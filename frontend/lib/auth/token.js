export const TOKEN_STORAGE_KEY = 'ste_access_token';

let memoryToken = null;
let hasReadStorage = false;

export function getToken() {
  if (memoryToken !== null) return memoryToken;
  if (hasReadStorage || typeof window === 'undefined') return memoryToken;

  hasReadStorage = true;
  try {
    memoryToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export function setToken(token) {
  memoryToken = token || null;
  hasReadStorage = true;
  if (typeof window === 'undefined') return;

  try {
    if (memoryToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, memoryToken);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

export function clearToken() {
  setToken(null);
}
