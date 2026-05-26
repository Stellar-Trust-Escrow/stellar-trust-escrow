const hasBrowserNetworkApi = typeof navigator !== 'undefined' && typeof window !== 'undefined';

let isOnline = hasBrowserNetworkApi ? navigator.onLine : true;

export const setOnlineStatus = (status) => {
  isOnline = status;
};

export const getOnlineStatus = () => isOnline;

if (hasBrowserNetworkApi) {
  window.addEventListener('online', () => setOnlineStatus(true));
  window.addEventListener('offline', () => setOnlineStatus(false));
}
