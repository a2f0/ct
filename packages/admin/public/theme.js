// Runs before styles load; stays external to satisfy the dashboard CSP.
try {
  const theme = localStorage.getItem("ct.theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  }
} catch {
  // Dark remains usable when browser storage is unavailable.
}
