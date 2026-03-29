let isOnline = navigator.onLine;

export const setOnlineStatus = (status) => {
  isOnline = status;
};

export const getOnlineStatus = () => isOnline;

window.addEventListener("online", () => setOnlineStatus(true));
window.addEventListener("offline", () => setOnlineStatus(false));