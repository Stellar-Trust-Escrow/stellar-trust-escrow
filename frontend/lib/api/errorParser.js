export const parseError = (error) => {
  // Offline errors
  if (error.isOffline) {
    return "You are offline. Please check your internet connection.";
  }

  // Axios network errors
  if (error.response) {
    // Server responded with status code outside 2xx
    const { status, data } = error.response;
    if (status >= 500) return "Server is currently unavailable. Please try again later.";
    if (status === 404) return "Requested resource not found.";
    if (status === 401) return "You are not authorized. Please login.";
    if (status === 403) return "Access forbidden.";
    // Fallback to server-provided message if available
    return data?.message || "Something went wrong. Please try again.";
  } else if (error.request) {
    // Request made but no response
    return "No response from server. Please check your connection.";
  } else if (error.message) {
    // JS error or other thrown error
    return error.message;
  }

  // Fallback
  return "An unknown error occurred.";
};